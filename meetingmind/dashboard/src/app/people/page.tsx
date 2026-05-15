import Link from "next/link";
import { getPersons } from "../../lib/butterbase";

const ORG_ID = process.env.DEFAULT_ORG_ID!;

export default async function PeoplePage() {
  const persons = await getPersons(ORG_ID);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold text-ink mb-6">People</h1>

      <div className="grid grid-cols-3 gap-4">
        {persons.map((p) => (
          <Link
            key={p.id}
            href={`/people/${p.id}`}
            className="bg-white border border-slate/20 rounded-md p-4 flex items-center gap-4 hover:border-clay/40 transition-colors"
          >
            {p.face_crop_url ? (
              <img src={p.face_crop_url} alt={p.name} className="h-12 w-12 rounded-sm object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-sm bg-stone flex items-center justify-center text-slate text-lg font-semibold">
                {p.name[0]}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{p.name}</p>
              {p.role && <p className="text-xs text-slate truncate">{p.role}</p>}
              <div className="flex gap-1 mt-1">
                <span className={`text-[10px] px-1 rounded-sm ${p.face_enrolled ? "bg-green-100 text-green-700" : "bg-slate/10 text-slate"}`}>
                  Face {p.face_enrolled ? "✓" : "—"}
                </span>
                <span className={`text-[10px] px-1 rounded-sm ${p.voice_enrolled ? "bg-green-100 text-green-700" : "bg-slate/10 text-slate"}`}>
                  Voice {p.voice_enrolled ? "✓" : "—"}
                </span>
              </div>
            </div>
          </Link>
        ))}
        {persons.length === 0 && (
          <p className="col-span-3 text-center text-sm text-slate py-16">
            No people enrolled yet. They are added automatically during meeting enrollment.
          </p>
        )}
      </div>
    </div>
  );
}
