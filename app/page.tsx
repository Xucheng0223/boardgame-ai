"use client";

import { useState, useRef, useEffect } from "react";

type Game = { id: string; label: string; starterQuestions: string[] };

type Source = { section: string; id: string; content: string };

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  followUps?: string[];
  error?: boolean;
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  start: () => void;
  stop: () => void;
};


// Minimal markdown renderer — handles bold, italic, inline code, headings, and lists
function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  function renderInline(raw: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let last = 0, m: RegExpExecArray | null;
    let key = 0;
    while ((m = re.exec(raw)) !== null) {
      if (m.index > last) parts.push(raw.slice(last, m.index));
      if (m[2]) parts.push(<strong key={key++}>{m[2]}</strong>);
      else if (m[3]) parts.push(<em key={key++}>{m[3]}</em>);
      else if (m[4]) parts.push(<code key={key++} className="bg-gray-200 text-gray-800 px-1 rounded text-xs font-mono">{m[4]}</code>);
      last = m.index + m[0].length;
    }
    if (last < raw.length) parts.push(raw.slice(last));
    return parts;
  }

  while (i < lines.length) {
    const line = lines[i];

    if (/^#{1,3} /.test(line)) {
      const level = line.match(/^(#+)/)?.[1].length ?? 1;
      const content = line.replace(/^#+\s*/, "");
      const Tag = `h${Math.min(level + 2, 6)}` as "h3" | "h4" | "h5" | "h6";
      elements.push(<Tag key={i} className="font-semibold mt-2 mb-0.5">{renderInline(content)}</Tag>);
    } else if (/^[-*] /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(<li key={i}>{renderInline(lines[i].replace(/^[-*] /, ""))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 my-1">{items}</ul>);
      continue;
    } else if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i}>{renderInline(lines[i].replace(/^\d+\. /, ""))}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className="list-decimal list-inside space-y-0.5 my-1">{items}</ol>);
      continue;
    } else if (line.trim() === "") {
      elements.push(<br key={i} />);
    } else {
      elements.push(<p key={i} className="mb-0.5">{renderInline(line)}</p>);
    }
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [game, setGame] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<number, boolean>>({});
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Feature-detect Web Speech API after mount to avoid hydration mismatch
  useEffect(() => {
    setSpeechSupported("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  }, []);

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    type SRConstructor = new () => SpeechRecognitionInstance;
    const w = window as typeof window & { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    };

    recognitionRef.current = rec;
    rec.start();
  }

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json())
      .then(({ games }: { games: Game[] }) => {
        setGames(games);
        if (games.length > 0) setGame(games[0].id);
      });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function copyAnswer(idx: number, content: string) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, game, history }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error ?? "Something went wrong.", error: true },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; data?: Source[]; text?: string; message?: string };
          try { event = JSON.parse(line); } catch { continue; }

          if (event.type === "sources") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { ...updated[updated.length - 1], sources: event.data };
              return updated;
            });
          } else if (event.type === "delta") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: updated[updated.length - 1].content + (event.text ?? ""),
              };
              return updated;
            });
          } else if (event.type === "error") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: event.message ?? "Something went wrong.",
                error: true,
              };
              return updated;
            });
          }
        }
      }
      // Parse follow-up questions out of the completed answer
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role !== "assistant" || last.error) return updated;

        const match = last.content.match(/FOLLOW_UP_QUESTIONS:\s*(\[.*?\])/s);
        if (match) {
          try {
            const followUps: string[] = JSON.parse(match[1]);
            updated[updated.length - 1] = {
              ...last,
              content: last.content.replace(/\nFOLLOW_UP_QUESTIONS:.*$/s, "").trimEnd(),
              followUps,
            };
          } catch { /* leave as-is if parse fails */ }
        }
        return updated;
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error. Please try again.", error: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const currentGame = games.find((g) => g.id === game);
  const gameLabel = currentGame?.label ?? game;
  const starters = currentGame?.starterQuestions ?? [];

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Board Game AI Judge</h1>
          <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">Rules questions answered from the rulebook — no hallucination.</p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setExpandedSources({}); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1"
              title="Clear chat"
            >
              Clear
            </button>
          )}
          <select
            value={game}
            onChange={(e) => { setGame(e.target.value); setMessages([]); setExpandedSources({}); }}
            className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            {games.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-6 space-y-6 max-w-3xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-16 text-sm">
            <p className="text-2xl mb-3">🎲</p>
            <p>Ask a rules question about <span className="text-gray-700 font-medium">{gameLabel}</span>.</p>
            <p className="mt-1 mb-6">Answers are grounded in the rulebook only.</p>
            {starters.length > 0 && (
              <div className="flex flex-col gap-2 max-w-md mx-auto text-left">
                {starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); }}
                    className="text-left text-xs text-gray-500 border border-gray-200 rounded-xl px-4 py-2.5 hover:border-gray-400 hover:text-gray-700 transition-colors bg-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`w-full sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-gray-800 text-white ml-8 sm:ml-0"
                  : msg.error
                  ? "bg-red-50 border border-red-200 text-red-700"
                  : "bg-white border border-gray-200 text-gray-800"
              }`}
            >
              {msg.role === "assistant" && !msg.error ? (
                <MarkdownText text={msg.content} />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}

              {/* Copy button */}
              {msg.role === "assistant" && !msg.error && msg.content && (
                <button
                  onClick={() => copyAnswer(i, msg.content)}
                  className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {copiedIdx === i ? "Copied!" : "Copy"}
                </button>
              )}

              {/* Follow-up suggestions */}
              {msg.followUps && msg.followUps.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap gap-2">
                  {msg.followUps.map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="text-xs text-gray-500 border border-gray-200 rounded-full px-3 py-1 hover:border-gray-400 hover:text-gray-700 transition-colors bg-gray-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Sources loading placeholder */}
              {msg.role === "assistant" && !msg.error && !msg.sources && msg.content === "" && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <span className="text-xs text-gray-400 animate-pulse">Checking rulebook…</span>
                </div>
              )}

              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => setExpandedSources((prev) => ({ ...prev, [i]: !prev[i] }))}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
                  >
                    <span>{expandedSources[i] ? "▾" : "▸"}</span>
                    <span>{msg.sources.length} rule{msg.sources.length !== 1 ? "s" : ""} checked</span>
                  </button>
                  {expandedSources[i] && (
                    <ul className="mt-2 space-y-2">
                      {msg.sources.map((s) => (
                        <li key={s.id} className="text-xs border border-gray-200 rounded-lg p-2 bg-gray-50">
                          <p className="text-gray-600 font-medium mb-1">{s.section}</p>
                          <p className="text-gray-500 leading-relaxed">{s.content}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-400">
              <span className="animate-pulse">Checking rulebook...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <footer className="border-t border-gray-200 bg-white px-3 sm:px-4 py-3 sm:py-4">
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Listening…" : "Ask a rules question…"}
            disabled={loading}
            className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50"
          />
          {speechSupported && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={loading}
              title={listening ? "Stop recording" : "Speak your question"}
              className={`rounded-xl px-3 py-3 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed border ${
                listening
                  ? "bg-red-50 border-red-300 text-red-600 animate-pulse"
                  : "bg-white border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
                <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5H10.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
              </svg>
            </button>
          )}
          <button
            type="submit"
            disabled={loading || input.trim() === ""}
            className="bg-gray-900 text-white font-medium text-sm rounded-xl px-5 py-3 hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Ask
          </button>
        </form>
      </footer>
    </div>
  );
}
