import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AutoDeployRefresh from "./AutoDeployRefresh";
import "./index.css";
import "./deleteUserDirectoryPatch";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <AutoDeployRefresh />
  </React.StrictMode>
);

