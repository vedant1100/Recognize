"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface Citation {
  meeting_id: string;
  title: string;
  date: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

export default function QueryPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, citations: data.citations },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error reaching the knowledge base." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-slate/20 bg-white">
        <h1 className="text-lg font-semibold text-ink">Executive Q&amp;A</h1>
        <p className="text-xs text-slate">Ask anything about your meetings. Answers are cited to specific sessions.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="text-center py-24">
            <p className="text-sm text-slate mb-6">Try asking:</p>
            {["What did we decide about the launch timeline?",
              "Who raised concerns about the Q3 budget?",
              "What action items does Sarah have pending?",
            ].map((q) => (
              <button key={q} onClick={() => setInput(q)}
                      className="block mx-auto mb-2 text-sm text-clay hover:underline">{q}</button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-2xl rounded-md px-4 py-3 ${
              msg.role === "user"
                ? "bg-ink text-white text-sm"
                : "bg-white border border-slate/20 text-ink text-sm"
            }`}>
              <p className="leading-relaxed">{msg.content}</p>
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate/20 flex flex-wrap gap-2">
                  {msg.citations.map((c, j) => (
                    <Link key={j} href={`/meetings/${c.meeting_id}`}
                          className="text-[10px] text-clay hover:underline">
                      {c.title || "Meeting"} · {c.date}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate/20 rounded-md px-4 py-3 flex items-center gap-2">
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-1.5 w-1.5 bg-slate rounded-full animate-pulse"
                      style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-8 py-4 border-t border-slate/20 bg-white">
        <div className="flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about your meetings…"
            className="flex-1 border border-slate/30 rounded-sm px-4 py-2.5 text-sm text-ink placeholder:text-slate focus:outline-none focus:border-clay"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 bg-ink text-white text-sm rounded-sm hover:bg-clay disabled:opacity-40 transition-colors"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
