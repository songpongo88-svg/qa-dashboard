<div className="flex flex-wrap items-center gap-3">
  <div className="flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-2 py-2">
    <span className="px-2 text-[11px] font-bold uppercase tracking-wide text-violet-700">
      Performance
    </span>

    <NavButton
      active={activeTab === "dashboard"}
      label="Dashboard"
      onClick={() => setActiveTab("dashboard")}
    />
    <NavButton
      active={activeTab === "summary"}
      label="Summary"
      onClick={() => setActiveTab("summary")}
    />
  </div>

  <div className="flex items-center gap-2 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-2 py-2">
    <span className="px-2 text-[11px] font-bold uppercase tracking-wide text-fuchsia-700">
      Review
    </span>

    <NavButton
      active={activeTab === "appeal"}
      label="Appeal"
      onClick={() => setActiveTab("appeal")}
    />
    <NavButton
      active={activeTab === "rubric"}
      label="QA Rubric"
      onClick={() => setActiveTab("rubric")}
    />
  </div>

  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-2">
    <span className="px-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
      Account
    </span>

    <button
      type="button"
      onClick={() => {
        resetChangePasswordState();
        setShowChangePasswordModal(true);
      }}
      className="rounded-2xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
    >
      Change Password
    </button>

    {currentUser.role === "Supervisor" ? (
      <button
        type="button"
        onClick={() => {
          resetPasswordModalState();
          setShowResetPasswordModal(true);
        }}
        className="rounded-2xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
      >
        Reset Password
      </button>
    ) : null}

    <button
      type="button"
      onClick={handleLogout}
      className="rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
    >
      Log Out
    </button>
  </div>
</div>