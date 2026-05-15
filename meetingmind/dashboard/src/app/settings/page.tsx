export default function SettingsPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-3xl font-semibold text-ink mb-8">Settings</h1>

      <div className="flex flex-col gap-6">
        <section className="bg-white border border-slate/20 rounded-md p-6">
          <h2 className="section-header">Google Workspace</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-ink font-medium">Domain-wide Calendar Access</p>
              <p className="text-xs text-slate mt-0.5">Required for the bot to detect and join meetings automatically.</p>
            </div>
            <a href="/api/auth/google" className="px-4 py-2 text-sm bg-ink text-white rounded-sm hover:bg-clay transition-colors">
              Connect
            </a>
          </div>
        </section>

        <section className="bg-white border border-slate/20 rounded-md p-6">
          <h2 className="section-header">MOM Distribution</h2>
          <p className="text-xs text-slate mb-3">
            Minutes of Meeting are emailed to these addresses after every completed meeting.
            Manage per-meeting overrides from the meeting detail page.
          </p>
          <textarea
            className="w-full border border-slate/30 rounded-sm px-3 py-2 text-sm text-ink placeholder:text-slate focus:outline-none focus:border-clay resize-none"
            rows={3}
            placeholder="email@company.com, another@company.com"
          />
          <button className="mt-3 px-4 py-2 text-sm bg-ink text-white rounded-sm hover:bg-clay transition-colors">
            Save
          </button>
        </section>

        <section className="bg-white border border-slate/20 rounded-md p-6">
          <h2 className="section-header">Enrollment</h2>
          <div className="flex flex-col gap-3">
            {[
              { label: "Face match threshold", value: "0.85", help: "Cosine similarity above which a face is auto-recognized." },
              { label: "Voice match threshold", value: "0.80", help: "Cosine similarity for voice identity matching." },
              { label: "Enrollment window (seconds)", value: "60", help: "How long the bot waits for host to label all faces." },
            ].map(({ label, value, help }) => (
              <div key={label} className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm text-ink font-medium">{label}</p>
                  <p className="text-xs text-slate">{help}</p>
                </div>
                <input
                  defaultValue={value}
                  className="w-20 border border-slate/30 rounded-sm px-2 py-1 text-sm text-right text-ink focus:outline-none focus:border-clay"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
