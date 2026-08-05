import React, { useState } from "react";
import { auth } from "../api";
import { Nav, useRouter } from "../main";

export function Landing() {
  const { navigate } = useRouter();
  const [prompt, setPrompt] = useState("");

  const start = () => {
    if (prompt.trim()) sessionStorage.setItem("pending_prompt", prompt.trim());
    navigate(auth.isLoggedIn ? "/dashboard" : "/auth");
  };

  return (
    <>
      <Nav />
      <div className="hero">
        <h1>
          Build apps by <span className="grad">just chatting</span>
        </h1>
        <p>
          Describe what you want in plain English. An AI agent writes the code, builds it, and shows
          you a live preview — all in seconds.
        </p>
        <div className="hero-cta">
          <button className="btn btn-primary" onClick={() => navigate(auth.isLoggedIn ? "/dashboard" : "/auth")}>
            {auth.isLoggedIn ? "Go to dashboard" : "Get started free"}
          </button>
          <a className="btn btn-ghost" href="#features">See how it works</a>
        </div>

        <div className="promptbox">
          <input
            placeholder="e.g. a todo app with dark mode and filters"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
          />
          <button className="btn btn-primary" onClick={start}>Start building →</button>
        </div>
      </div>

      <div className="features" id="features">
        <div className="feature">
          <div className="ic">💬</div>
          <h3>Prompt to app</h3>
          <p>Type a description and watch the agent scaffold, write, and wire up a real React app live.</p>
        </div>
        <div className="feature">
          <div className="ic">⚡</div>
          <h3>Instant preview</h3>
          <p>Every change hot-reloads in a live preview beside the chat. See it as it's built.</p>
        </div>
        <div className="feature">
          <div className="ic">☁️</div>
          <h3>Always saved</h3>
          <p>Projects sleep when idle to save resources and wake instantly — your work and chat are never lost.</p>
        </div>
      </div>
    </>
  );
}
