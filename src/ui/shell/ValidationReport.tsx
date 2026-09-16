/**
 * Full-screen startup failure (FR-61): the app refuses to run while config or content has a
 * problem. Rendered by main.tsx without the store.
 */
export function ValidationReport({ problems }: { problems: string[] }) {
  return (
    <div className="validation-report" role="alert">
      <div className="banner banner--synthetic" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="banner__body">Synthetic data — demonstration only. Not for real patients.</div>
      </div>
      <h1>Configuration did not validate</h1>
      <p className="muted">
        The app refuses to run until every file under config/ and content/ passes validation. {problems.length}{' '}
        {problems.length === 1 ? 'problem' : 'problems'} found.
      </p>
      <ul className="validation-report__list">
        {problems.map((p, i) => (
          <li key={i} className="validation-report__item">
            {p}
          </li>
        ))}
      </ul>
      <p className="small muted">Fix the files, then reload. Run `npm run validate` to see the same report in the terminal.</p>
    </div>
  );
}
