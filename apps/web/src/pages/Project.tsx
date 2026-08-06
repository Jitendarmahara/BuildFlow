import React, { useEffect, useRef, useState } from "react";
import { api, type Message } from "../api";
import { connectProject, type AgentEvent } from "../ws";
import { PREVIEW_URL } from "../config";
import { Nav, useRouter } from "../main";

type Tool = { name: string; detail?: string; agent?: string };
type PlanStatus = "pending" | "in_progress" | "done";
type PlanTask = { id: string; description: string; status: PlanStatus };
type Item =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "plan"; tasks: PlanTask[] } // the agent's live checklist (create_plan + update_task_status)
  | { kind: "tools"; steps: Tool[] } // consecutive tool calls collapse into one group
  | { kind: "verify"; ok: boolean; attempt: number }
  | { kind: "err"; text: string }
  | { kind: "question"; id: string; question: string; options?: string[]; answered?: boolean };

// friendly verb + icon for each tool
function toolLabel(t: Tool): { icon: string; verb: string; detail?: string } {
  const map: Record<string, [string, string]> = {
    read_file: ["👁", "Read"],
    write_file: ["✎", "Wrote"],
    run_command: ["⚙", "Ran"],
    rename_file: ["↦", "Renamed"],
    delete_file: ["✕", "Deleted"],
    list_files: ["📁", "Scanned files"],
    create_plan: ["◇", "Planned"],
    update_task_status: ["◇", "Updated task"],
    spawn_subagents: ["⑂", "Delegated to sub-agents"],
    read: ["👁", "Read"],
  };
  const [icon, verb] = map[t.name] ?? ["•", t.name];
  return { icon, verb, detail: t.detail };
}

// once a turn ends, nothing is "in progress" — mark every plan task done so no spinner lingers.
const allDone = (tasks: PlanTask[]): PlanTask[] => tasks.map((t) => ({ ...t, status: "done" as PlanStatus }));
const finalizeAllPlans = (items: Item[]): Item[] =>
  items.map((it) => (it.kind === "plan" ? { kind: "plan", tasks: allDone(it.tasks) } : it));
function finalizeLastPlan(items: Item[]): Item[] {
  const next = [...items];
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].kind === "plan") { next[i] = { kind: "plan", tasks: allDone((next[i] as Extract<Item, { kind: "plan" }>).tasks) }; break; }
  }
  return next;
}
function setTask(out: Item[], taskId: string, status: PlanStatus) {
  for (let i = out.length - 1; i >= 0; i--) {
    const it = out[i];
    if (it.kind === "plan") { it.tasks = it.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)); return; }
  }
}
function mapHistory(msgs: Message[]): Item[] {
  const out: Item[] = [];
  for (const m of msgs) {
    if (m.kind === "user" && m.content) out.push({ kind: "user", text: m.content });
    else if (m.kind === "assistant" && m.content) out.push({ kind: "assistant", text: m.content });
    else if (m.kind === "tool_call" && m.toolName === "create_plan") {
      const tasks: PlanTask[] = (m.args?.tasks ?? []).map((t: any) => ({ id: t.id, description: t.description, status: "pending" as PlanStatus }));
      if (tasks.length) out.push({ kind: "plan", tasks });
    } else if (m.kind === "tool_call" && m.toolName === "update_task_status") {
      if (m.args?.taskId) setTask(out, m.args.taskId, m.args.status ?? "done");
    } else if (m.kind === "tool_call" && m.toolName) {
      const last = out[out.length - 1];
      const step: Tool = { name: m.toolName, detail: m.path ?? undefined };
      if (last && last.kind === "tools") last.steps.push(step);
      else out.push({ kind: "tools", steps: [step] });
    }
  }
  return out;
}

// ---- file tree ----
type Node = { name: string; path: string; dir: boolean; children: Node[] };
function buildTree(paths: string[]): Node[] {
  const root: Node = { name: "", path: "", dir: true, children: [] };
  for (const p of paths) {
    const parts = p.split("/");
    let cur = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      let child = cur.children.find((c) => c.name === part);
      if (!child) { child = { name: part, path: parts.slice(0, i + 1).join("/"), dir: !isFile, children: [] }; cur.children.push(child); }
      cur = child;
    });
  }
  const sort = (n: Node) => { n.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1)); n.children.forEach(sort); };
  sort(root);
  return root.children;
}
function Tree({ nodes, depth, active, onSelect }: { nodes: Node[]; depth: number; active: string | null; onSelect: (p: string) => void }) {
  return (
    <>
      {nodes.map((n) =>
        n.dir ? (
          <div key={n.path}>
            <div className="tnode dir" style={{ paddingLeft: depth * 14 + 8 }}>▸ {n.name}</div>
            <Tree nodes={n.children} depth={depth + 1} active={active} onSelect={onSelect} />
          </div>
        ) : (
          <div key={n.path} className={"tnode file" + (active === n.path ? " active" : "")} style={{ paddingLeft: depth * 14 + 22 }} onClick={() => onSelect(n.path)}>{n.name}</div>
        )
      )}
    </>
  );
}

// the agent's plan, as a live checklist — tasks tick from ○ → spinner → ✓ as it works
function Plan({ tasks }: { tasks: PlanTask[] }) {
  const done = tasks.filter((t) => t.status === "done").length;
  return (
    <div className="plan">
      <div className="plan-head">
        <span className="plan-title">◇ Plan</span>
        <span className="plan-progress">{done}/{tasks.length} done</span>
      </div>
      <div className="plan-body">
        {tasks.map((t) => (
          <div key={t.id} className={"ptask " + t.status}>
            <span className="ptask-ic">
              {t.status === "done" ? "✓" : t.status === "in_progress" ? <span className="spinner sm" /> : "○"}
            </span>
            <span className="ptask-desc">{t.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Activity strip for a run of tool calls. While the agent is working (`live`) this
// auto-expands and streams each step in, with the current action called out — so the
// user can always see what's happening. Once done it collapses to a one-line summary,
// and can be toggled open to review what the agent did.
function Activity({ steps, live }: { steps: Tool[]; live: boolean }) {
  // null = follow the default (open while live, collapsed when done); a bool = user override
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? live;
  const last = steps[steps.length - 1];
  const ll = last ? toolLabel(last) : null;
  return (
    <div className={"activity" + (live ? " live" : "")}>
      <div className="activity-head" onClick={() => setUserOpen(!open)}>
        {live ? <span className="spinner sm" /> : <span className="ok-dot">✓</span>}
        <span className="activity-title">{live ? "Working…" : "Done"}</span>
        <span className="activity-count">{steps.length} step{steps.length > 1 ? "s" : ""}</span>
        {/* current action while live, or the last action when collapsed */}
        {ll && (!open || live) && (
          <span className="activity-last">{ll.verb}{ll.detail ? " " + ll.detail : ""}</span>
        )}
        {live && last?.agent && <span className="agent-badge">⑂ {last.agent}</span>}
        <span className="chev">{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="activity-body">
          {steps.map((s, i) => {
            const l = toolLabel(s);
            const isCurrent = live && i === steps.length - 1;
            return (
              <div key={i} className={"step" + (isCurrent ? " current" : "")}>
                <span className="step-ic">{isCurrent ? <span className="spinner sm" /> : l.icon}</span>
                <span className="step-verb">{l.verb}</span>
                {l.detail && <span className="step-detail">{l.detail}</span>}
                {s.agent && <span className="agent-badge step-agent">⑂ {s.agent}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Project({ id }: { id: string }) {
  const { navigate } = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"opening" | "ready">("opening");
  const [busy, setBusy] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [preview, setPreview] = useState<"connecting" | "ready" | "error">("connecting");
  const [view, setView] = useState<"preview" | "code">("preview");
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeContent, setActiveContent] = useState<string>("");
  const connRef = useRef<ReturnType<typeof connectProject> | null>(null);
  const streamingRef = useRef(false);
  const activeFileRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const selectFile = (p: string) => { setActiveFile(p); activeFileRef.current = p; setActiveContent(""); connRef.current?.readFile(p); };

  // ask the web server to (re)connect this project's preview port-forward, then reload the iframe
  async function ensurePreview() {
    setPreview("connecting");
    try {
      const r = await fetch(`/api/preview/${id}`, { method: "POST" });
      const d = await r.json();
      setPreview(d.ok ? "ready" : "error");
      if (d.ok) setPreviewKey((k) => k + 1);
    } catch { setPreview("error"); }
  }

  const pushTool = (t: Tool) =>
    setItems((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.kind === "tools") next[next.length - 1] = { kind: "tools", steps: [...last.steps, t] };
      else next.push({ kind: "tools", steps: [t] });
      return next;
    });

  const onEvent = (e: AgentEvent) => {
    if (e.type === "__reconnected") {
      // the socket came back after a drop — re-fetch the durable log so the UI catches up
      // on every step that happened while we were disconnected, then keep streaming live.
      api.getMessages(id).then((h) => {
        const mapped = mapHistory(h);
        const inProgress = mapped.length > 0 && mapped[mapped.length - 1].kind !== "assistant";
        setItems(inProgress ? mapped : finalizeAllPlans(mapped));
        setBusy(inProgress);
        streamingRef.current = false;
      }).catch(() => {});
      return;
    }
    if (e.type === "token") {
      setBusy(true);
      // a sub-agent's internal reasoning — keep it out of the main assistant bubble;
      // its work still shows up as attributed tool steps below.
      if (e.agent) return;
      setItems((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (streamingRef.current && last && last.kind === "assistant") next[next.length - 1] = { kind: "assistant", text: last.text + e.text };
        else { next.push({ kind: "assistant", text: e.text }); streamingRef.current = true; }
        return next;
      });
      return;
    }
    if (e.type === "files") {
      setFiles(e.files);
      if (!activeFileRef.current) {
        const def = e.files.find((f: string) => /App\.(jsx|tsx)$/.test(f)) ?? e.files.find((f: string) => f.startsWith("src/")) ?? e.files[0];
        if (def) selectFile(def);
      }
      return;
    }
    if (e.type === "file_content") { if (e.path === activeFileRef.current) setActiveContent(e.content); return; }
    streamingRef.current = false;
    // the plan tools drive the checklist card, not the noisy activity feed
    if (e.type === "tool_call" && e.name === "create_plan") {
      setBusy(true);
      const tasks: PlanTask[] = (e.args?.tasks ?? []).map((t: any) => ({ id: t.id, description: t.description, status: "pending" }));
      if (tasks.length) setItems((p) => [...p, { kind: "plan", tasks }]);
      return;
    }
    if (e.type === "tool_call" && e.name === "update_task_status") {
      setBusy(true);
      const taskId = e.args?.taskId, status: PlanStatus = e.args?.status ?? "done";
      setItems((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          const it = next[i];
          if (it.kind === "plan") { next[i] = { kind: "plan", tasks: it.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) }; break; }
        }
        return next;
      });
      return;
    }
    if (e.type === "tool_call") { setBusy(true); pushTool({ name: e.name, detail: e.args?.path ?? e.args?.to ?? e.args?.command, agent: e.agent }); }
    else if (e.type === "verify") setItems((p) => [...p, { kind: "verify", ok: e.ok, attempt: e.attempt }]);
    else if (e.type === "question") { setBusy(false); setItems((p) => [...p, { kind: "question", id: e.id, question: e.question, options: e.options }]); }
    // the agent refused a prompt because it is mid-turn. our own `busy` was wrong or we
    // would not have sent it (a stale flag after a reconnect, or another tab) — so trust
    // the agent and put the spinner back, rather than clearing it the way an error does.
    else if (e.type === "busy") { setBusy(true); setItems((p) => [...p, { kind: "err", text: e.message }]); }
    else if (e.type === "error") { setBusy(false); setItems((p) => [...p, { kind: "err", text: e.message }]); }
    else if (e.type === "done") {
      setBusy(false);
      setItems((prev) => finalizeLastPlan(prev)); // turn finished → stop the plan spinner
      setTimeout(() => setPreviewKey((k) => k + 1), 800);
      connRef.current?.listFiles();
      if (activeFileRef.current) connRef.current?.readFile(activeFileRef.current);
    }
  };

  useEffect(() => {
    let conn: ReturnType<typeof connectProject> | null = null;
    (async () => {
      setStatus("opening");
      try { await api.openProject(id); } catch { /* may already be running */ }
      ensurePreview(); // spin up this project's preview tunnel (retries while it wakes)
      const history = await api.getMessages(id).catch(() => []);
      const mapped = mapHistory(history);
      // if the last durable message isn't a finished assistant reply, a turn is still
      // in flight (e.g. the very first build); otherwise it's settled → no lingering spinners.
      const inProgress = mapped.length > 0 && mapped[mapped.length - 1].kind !== "assistant";
      setItems(inProgress ? mapped : finalizeAllPlans(mapped));
      if (inProgress) setBusy(true);
      conn = connectProject(id, onEvent);
      connRef.current = conn;
      setStatus("ready");
    })();
    return () => conn?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [items, busy]);

  const showCode = () => { setView("code"); connRef.current?.listFiles(); };
  const send = () => {
    const text = input.trim();
    // the agent runs one turn at a time and rejects anything sent during one, so sending
    // here would only append a bubble it is going to refuse. keep the draft in the box.
    if (!text || !connRef.current || busy) return;
    setItems((p) => [...p, { kind: "user", text }]);
    connRef.current.sendPrompt(text);
    setInput(""); setBusy(true); streamingRef.current = false;
  };
  const answer = (idx: number, q: Extract<Item, { kind: "question" }>, content: string) => {
    connRef.current?.answer(q.id, content); setBusy(true);
    setItems((prev) => { const next = [...prev]; next[idx] = { ...q, answered: true }; next.push({ kind: "user", text: content }); return next; });
  };

  const lastToolsIdx = (() => { for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === "tools") return i; return -1; })();

  return (
    <div className="build-page">
      <Nav />
      <div className="build">
        <div className="chat">
          <div className="chat-head">
            <h3>Build session</h3>
            <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => navigate("/dashboard")}>← Projects</button>
          </div>
          <div className="msgs">
            {status === "opening" && <div className="thinking"><span className="spinner sm" /> Waking the project…</div>}
            {items.map((it, i) => {
              if (it.kind === "user") return <div key={i} className="msg user">{it.text}</div>;
              if (it.kind === "assistant") return <div key={i} className="msg assistant">{it.text}{busy && i === items.length - 1 && <span className="cursor" />}</div>;
              if (it.kind === "plan") return <Plan key={i} tasks={it.tasks} />;
              if (it.kind === "tools") return <Activity key={i} steps={it.steps} live={busy && i === lastToolsIdx} />;
              if (it.kind === "verify") return <div key={i} className={"chip " + (it.ok ? "ok" : "warn")}>{it.ok ? "✓ Build passed" : `⟳ Fixing build (attempt ${it.attempt})`}</div>;
              if (it.kind === "err") return <div key={i} className="chip err">⚠ {it.text}</div>;
              if (it.kind === "question")
                return (
                  <div key={i} className="question">
                    <p>{it.question}</p>
                    {it.answered ? <div style={{ color: "var(--text-faint)", fontSize: 13 }}>answered</div>
                      : it.options && it.options.length ? (
                        <div className="qopts">{it.options.map((o) => <button key={o} className="btn" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => answer(i, it, o)}>{o}</button>)}</div>
                      ) : <QuestionInput onSubmit={(v) => answer(i, it, v)} />}
                  </div>
                );
              return null;
            })}
            {busy && (() => {
              const last = items[items.length - 1];
              // the bubble cursor (assistant) and the live Activity (tools) already show motion;
              // otherwise — e.g. right after the first prompt — show a clear "working" card.
              if (last && (last.kind === "assistant" || last.kind === "tools")) return null;
              return (
                <div className="working">
                  <span className="spinner" />
                  <div className="working-txt">
                    <div className="working-title">Building your app…</div>
                    <div className="working-sub">reading the project and planning the changes</div>
                  </div>
                </div>
              );
            })()}
            <div ref={endRef} />
          </div>
          <div className="composer">
            <textarea placeholder={busy ? "Working… you can type your next change" : "Ask for a change… e.g. make the header sticky"} value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} />
            <button className="btn btn-primary" onClick={send} disabled={!input.trim() || busy}>Send</button>
          </div>
        </div>

        <div className="preview">
          <div className="preview-bar">
            <div className="seg">
              <button className={"seg-btn" + (view === "preview" ? " on" : "")} onClick={() => setView("preview")}>Preview</button>
              <button className={"seg-btn" + (view === "code" ? " on" : "")} onClick={showCode}>Code</button>
            </div>
            {view === "preview" ? (
              <>
                <span className="url">{PREVIEW_URL}</span>
                <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 13 }} onClick={ensurePreview}>↻ Reload</button>
              </>
            ) : <span className="url">{activeFile ?? "select a file"}</span>}
          </div>
          {view === "preview" ? (
            preview === "ready" ? (
              <iframe key={previewKey} src={PREVIEW_URL} title="preview" />
            ) : preview === "connecting" ? (
              <div className="preview-msg"><span className="spinner" /><div className="pm-title">Connecting preview…</div><div className="dim">waking the project & linking its live server</div></div>
            ) : (
              <div className="preview-msg">
                <div className="pm-title">Preview isn't connected</div>
                <div className="dim">The project may still be starting up. Reconnect to try again.</div>
                <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={ensurePreview}>Reconnect preview</button>
              </div>
            )
          ) : (
            <div className="code-panel">
              <div className="file-tree">
                {files.length === 0 ? <div style={{ padding: 12, color: "var(--text-faint)", fontSize: 13 }}>No files yet.</div>
                  : <Tree nodes={buildTree(files)} depth={0} active={activeFile} onSelect={selectFile} />}
              </div>
              <pre className="file-view">{activeFile ? (activeContent || "…") : "Select a file to view its code."}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionInput({ onSubmit }: { onSubmit: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input className="url" style={{ flex: 1, color: "var(--text)" }} value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && v.trim() && onSubmit(v.trim())} placeholder="type your answer…" />
      <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => v.trim() && onSubmit(v.trim())}>Send</button>
    </div>
  );
}
