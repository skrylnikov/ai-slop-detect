export const labelStyles = `
  .ai-slop-label {
    position: absolute;
    top: 28px;
    right: 28px;
    z-index: 1;
    width: fit-content;
    margin: 0;
    padding: 4px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    background: #f8fafc;
    color: #475569;
    font: 600 12px/1.3 system-ui, sans-serif;
    cursor: pointer;
  }
  .ai-slop-label:hover { filter: brightness(0.96); }
  .ai-slop-label-card { position: relative; }
  .ai-slop-label[data-label="green"] { border-color: #86efac; background: #f0fdf4; color: #15803d; }
  .ai-slop-label[data-label="yellow"] { border-color: #fde68a; background: #fffbeb; color: #a16207; }
  .ai-slop-label[data-label="red"] { border-color: #fca5a5; background: #fef2f2; color: #b91c1c; }
  .ai-slop-label[data-label="error"] { border-color: #fecaca; background: #fff1f2; color: #be123c; }
`;

export const panelStyles = `
  :host { all: initial; color-scheme: light; font-family: system-ui, sans-serif; }
  *, *::before, *::after { box-sizing: border-box; }
  section { min-height: 100vh; padding: 24px; color: #172033; background: #ffffff; font: 14px/1.5 system-ui, sans-serif; }
  .panel-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
  .eyebrow { display: block; margin-bottom: 6px; color: #64748b; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  h2 { flex: 1; margin: 0; font-size: 22px; line-height: 1.2; letter-spacing: -.02em; }
  h3 { margin: 24px 0 8px; font-size: 14px; }
  .close { display: grid; place-items: center; flex: 0 0 auto; width: 36px; height: 36px; padding: 0; border: 1px solid #cbd5e1; border-radius: 10px; color: #334155; background: #f8fafc; font-size: 22px; line-height: 1; }
  .score-card { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; }
  .score-label { color: #0f766e; font-size: 16px; font-weight: 700; }
  .score-total, .muted, .optional { color: #64748b; }
  .breakdown { margin: 10px 2px 0; color: #64748b; font-size: 13px; }
  .votes { margin-top: 24px; }
  .votes ul { max-height: 160px; margin: 0; padding: 0; overflow: auto; list-style: none; }
  .votes li { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
  .vote-kind { margin-right: 6px; font-weight: 700; }
  .vote-human { color: #15803d; }
  .vote-partial { color: #a16207; }
  .vote-ai { color: #b91c1c; }
  button { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 13px; color: #334155; background: #ffffff; font: inherit; font-weight: 600; cursor: pointer; }
  button:hover { filter: brightness(0.97); }
  .more { margin-top: 10px; color: #2563eb; border-color: #bfdbfe; background: #eff6ff; }
  fieldset { margin: 24px 0 16px; padding: 14px 16px; border: 1px solid #cbd5e1; border-radius: 12px; }
  legend { padding: 0 6px; font-weight: 700; }
  fieldset label { margin-right: 16px; }
  .comment { display: block; margin-bottom: 16px; font-weight: 700; }
  .optional { margin-left: 6px; font-weight: 400; }
  textarea { display: block; width: 100%; min-height: 96px; margin-top: 7px; padding: 10px; color: #172033; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; resize: vertical; }
  .actions { display: flex; gap: 8px; }
  .primary { color: #ffffff; border-color: #2563eb; background: #2563eb; }
  .danger { color: #b91c1c; border-color: #fecaca; background: #fff1f2; }
  [role="status"] { min-height: 1.5em; margin: 12px 0 0; color: #64748b; }
  @media (prefers-color-scheme: dark) {
    section { color: #e5e7eb; background: #111827; }
    .eyebrow, .score-total, .muted, .optional, .breakdown, [role="status"] { color: #94a3b8; }
    .score-card, .close, textarea { color: #e5e7eb; background: #1f2937; border-color: #475569; }
    .votes li { border-color: #334155; }
    button { color: #e5e7eb; background: #1f2937; border-color: #475569; }
    .more { color: #bfdbfe; background: #172554; border-color: #1d4ed8; }
  }
`;
