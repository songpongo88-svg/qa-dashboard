import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import MaintenanceRuntime from "./MaintenanceRuntime";
import AutoDeployRefresh from "./AutoDeployRefresh";
import "./index.css";
import "./deleteUserDirectoryPatch";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <AutoDeployRefresh />
    <MaintenanceRuntime />
  </React.StrictMode>
);

