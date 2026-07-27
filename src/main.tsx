import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import MaintenanceRuntime from "./MaintenanceRuntime";
import AutoDeployRefresh from "./AutoDeployRefresh";
import "./index.css";
import "./deleteUserDirectoryPatch";

// data-root-error-boundary-v149
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { errorMessage: string; errorStack: string }
> {
  state = { errorMessage: "", errorStack: "" };

  static getDerivedStateFromError(error: unknown) {
    return {
      errorMessage:
        error instanceof Error
          ? error.message
          : String(error || "Unknown error"),
      errorStack:
        error instanceof Error && error.stack
          ? error.stack
          : "",
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("QA Dashboard root crashed", error, info);
  }

  clearBrowserStateAndReload = () => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch (error) {
      console.warn("Could not clear browser storage", error);
    }
    window.location.href = "/";
  };

  render() {
    if (!this.state.errorMessage) return this.props.children;

    return (
      <div
        className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-6 text-slate-950"
        style={{ fontFamily: "'Kanit', sans-serif" }}
      >
        <div className="mx-auto mt-10 max-w-3xl rounded-[28px] border border-rose-200 bg-white p-6 shadow-xl shadow-rose-100">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-rose-600">
            QA Dashboard Recovery
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-950">
            ระบบเปิดหน้าไม่สำเร็จ
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            ระบบจับข้อผิดพลาดไว้แล้วเพื่อไม่ให้ขึ้นหน้าขาว กดปุ่มด้านล่างเพื่อล้างสถานะหน้าเว็บใน Browser แล้วโหลดใหม่
          </p>
          <button
            type="button"
            onClick={this.clearBrowserStateAndReload}
            className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-violet-800"
          >
            Clear browser state and reload
          </button>
          <pre className="mt-5 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-rose-50 p-4 text-xs font-semibold text-rose-700">
            {this.state.errorMessage}
            {this.state.errorStack ? "\n\n" + this.state.errorStack : ""}
          </pre>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
      <AutoDeployRefresh />
      <MaintenanceRuntime />
    </RootErrorBoundary>
  </React.StrictMode>
);

