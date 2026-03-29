function LoginScreen({
  onLogin,
}: {
  onLogin: (user: UserLike) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedUsername = username.trim();

    const matchedUser = USER_ACCOUNTS.find(
      (user) =>
        user.username === normalizedUsername && user.password === password
    );

    if (!matchedUser) {
      setErrorText("Username หรือ Password ไม่ถูกต้อง");
      return;
    }

    setErrorText("");
    onLogin(matchedUser);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center p-6">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
          <div className="bg-gradient-to-br from-violet-950 via-violet-800 to-fuchsia-700 p-8 text-white lg:p-10">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-200">
              Robinhood QA Platform
            </div>

            <h1 className="mt-4 text-4xl font-bold leading-tight">
              QA Dashboard
              <br />
              Appeal Review
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-7 text-violet-100">
              Sign in to access your QA Dashboard, Case Detail, and Appeal
              Review.
            </p>

            <div className="mt-8 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="text-sm font-semibold">Access Control</div>
                <div className="mt-1 text-xs text-violet-100">
                  Users with View all agents can access all dashboards. Other
                  users can access only their own data.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="text-sm font-semibold">Available Accounts</div>
                <div className="mt-1 text-xs text-violet-100">
                  This login page accepts only the configured agent accounts.
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 lg:p-10">
            <div className="mx-auto max-w-md">
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">
                Login
              </div>

              <h2 className="mt-3 text-3xl font-bold text-slate-900">
                Welcome back
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Enter your username and password to continue.
              </p>

              <form onSubmit={handleLogin} className="mt-8 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                {errorText ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {errorText}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-800"
                >
                  Sign In
                </button>
              </form>

              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Access Summary
                </div>
                <div className="mt-3 text-xs leading-6 text-slate-600">
                  View all agents: anucha, krivut, Phrommarin, songpon,
                  suphitcha
                  <br />
                  Own data only: all remaining users
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
