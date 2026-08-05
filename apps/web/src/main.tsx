import React, { createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { auth } from "./api";
import { Landing } from "./pages/Landing";
import { Auth } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { Project } from "./pages/Project";

// --- tiny router (pathname + history) so we avoid a routing dependency ---
type Router = { path: string; navigate: (to: string) => void };
const RouterCtx = createContext<Router>({ path: "/", navigate: () => {} });
export const useRouter = () => useContext(RouterCtx);

function App() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (to: string) => {
    if (to === window.location.pathname) return;
    window.history.pushState({}, "", to);
    setPath(to);
  };

  let page: React.ReactNode;
  if (path === "/") page = <Landing />;
  else if (path === "/auth") page = <Auth />;
  else if (path === "/dashboard") page = auth.isLoggedIn ? <Dashboard /> : <Auth />;
  else if (path.startsWith("/project/")) page = auth.isLoggedIn ? <Project id={path.slice("/project/".length)} /> : <Auth />;
  else page = <Landing />;

  return <RouterCtx.Provider value={{ path, navigate }}>{page}</RouterCtx.Provider>;
}

export function Nav() {
  const { navigate } = useRouter();
  return (
    <div className="nav">
      <div className="brand" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
        <span className="dot" /> Lovable
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {auth.isLoggedIn ? (
          <>
            <button className="btn btn-ghost" onClick={() => navigate("/dashboard")}>Dashboard</button>
            <button className="btn btn-ghost" onClick={() => { auth.clear(); navigate("/"); }}>Sign out</button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => navigate("/auth")}>Sign in</button>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
