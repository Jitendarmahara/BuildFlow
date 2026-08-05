import React, { useEffect, useState } from "react";
import { api, type Project } from "../api";
import { Nav, useRouter } from "../main";

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Dashboard() {
  const { navigate } = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    // a prompt typed on the landing page carries over
    const pending = sessionStorage.getItem("pending_prompt");
    if (pending) { setPrompt(pending); sessionStorage.removeItem("pending_prompt"); }
    api.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const create = async () => {
    if (!prompt.trim() || creating) return;
    setCreating(true);
    setErr("");
    try {
      const id = await api.createProject(prompt.trim());
      navigate(`/project/${id}`);
    } catch (e: any) {
      setErr("Could not create project. Try again.");
      setCreating(false);
    }
  };

  const open = async (p: Project) => {
    // waking (if slept/archived) happens inside the project view on load
    navigate(`/project/${p.id}`);
  };

  return (
    <>
      <Nav />
      <div className="dash">
        <h1>Your projects</h1>
        <p className="muted">Describe a new app, or reopen one — sleeping projects wake instantly.</p>

        <div className="new-project">
          <input
            placeholder="Describe a new app… e.g. a markdown notes app"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button className="btn btn-primary" onClick={create} disabled={creating || !prompt.trim()}>
            {creating ? <span className="spinner" /> : "Create →"}
          </button>
        </div>
        {err && <div className="err" style={{ marginBottom: 20 }}>{err}</div>}

        {projects === null ? (
          <div className="empty"><span className="spinner" /> Loading…</div>
        ) : projects.length === 0 ? (
          <div className="empty">No projects yet — describe one above to get started.</div>
        ) : (
          <div className="proj-grid">
            {projects.map((p) => (
              <div key={p.id} className="proj-card" onClick={() => open(p)}>
                <div className="top">
                  <h3>{p.title || "Untitled"}</h3>
                  <span className={`badge ${p.status}`}>{p.status}</span>
                </div>
                <div className="time">Updated {timeAgo(p.updatedAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
