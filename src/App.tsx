export default function App() {
  return (
    <div className="container">
      <div className="card">
        <h1 className="title">QA Appeal Results Portal</h1>

        <p className="subtitle">
          โหมดนี้เป็น demo role visibility เท่านั้น
        </p>

        <div className="form">
          <label>Demo User</label>
          <select className="input">
            <option>Select demo user</option>
            <option>Admin</option>
            <option>QA</option>
            <option>Agent</option>
          </select>

          <label>Access Code</label>
          <input className="input" placeholder="Enter access code" />

          <button className="button">Unlock Dashboard</button>
        </div>
      </div>
    </div>
  )
}
