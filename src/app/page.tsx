"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Paperclip, Send, Loader2, MessageSquare, Eye, Sparkles, X, Download, RotateCcw,
} from "lucide-react";

type Stage = "idle" | "analyzing" | "sketching" | "writing" | "testing" | "done" | "error";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

interface ProjectMeta {
  name: string;
  description: string;
  icon: string;
}

interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
}

const STAGES: { key: Stage; label: string }[] = [
  { key: "analyzing", label: "Analyzing your idea…" },
  { key: "sketching", label: "Sketching the design…" },
  { key: "writing", label: "Writing the code…" },
  { key: "testing", label: "Testing the build…" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function LurkHome() {
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [view, setView] = useState<"chat" | "preview">("chat");
  const [html, setHtml] = useState<string | null>(null);
  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [mockups, setMockups] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lurk-project");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.html) {
          setHtml(data.html);
          setMeta(data.meta);
          setMessages(data.messages || []);
          setView("preview");
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (html && meta) {
      try {
        localStorage.setItem("lurk-project", JSON.stringify({ html, meta, messages }));
      } catch { /* ignore */ }
    }
  }, [html, meta, messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stage]);

  const clearStageTimer = () => {
    if (stageTimerRef.current) {
      clearInterval(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  };

  const runStageAnimation = useCallback(() => {
    clearStageTimer();
    let idx = 0;
    setStage(STAGES[0].key);
    setMockups([generateMockupSvg(0), generateMockupSvg(1)]);
    stageTimerRef.current = setInterval(() => {
      idx += 1;
      if (idx < STAGES.length) setStage(STAGES[idx].key);
      else clearStageTimer();
    }, 1800);
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (file.size > 4 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          {
            id: uid(),
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl: typeof reader.result === "string" ? reader.result : undefined,
          },
        ]);
      };
      if (file.type.startsWith("image/") || file.type.startsWith("text/")) {
        reader.readAsDataURL(file);
      } else {
        setAttachments((prev) => [
          ...prev,
          { id: uid(), name: file.name, type: file.type, size: file.size },
        ]);
      }
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const submit = async () => {
    const text = prompt.trim();
    if (!text || isBuilding) return;

    setIsBuilding(true);
    setError(null);
    setWarning(null);
    setView("chat");
    runStageAnimation();

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    const currentAttachments = [...attachments];
    setAttachments([]);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          previousHtml: html || undefined,
          history: messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
          attachments: currentAttachments.map((a) => ({
            name: a.name,
            type: a.type,
            dataUrl: a.dataUrl?.slice(0, 500) || undefined,
          })),
        }),
      });

      const data = await res.json();
      clearStageTimer();

      if (!res.ok || data.error) {
        setStage("error");
        setError(data.error || "Generation failed");
        setIsBuilding(false);
        return;
      }

      setStage("done");
      setHtml(data.html);
      setMeta({
        name: data.name,
        description: data.description,
        icon: data.icon || "⚡",
      });
      if (data.warning) setWarning(data.warning);

      const assistantMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: `Built **${data.name}** — ${data.description}${
          data.model && data.model !== "fallback" ? ` (via ${data.model})` : ""
        }`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setView("preview");
      setMockups([]);
    } catch (e: unknown) {
      clearStageTimer();
      setStage("error");
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setIsBuilding(false);
    }
  };

  const downloadHtml = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(meta?.name || "lurk-app").replace(/\s+/g, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetProject = () => {
    if (!confirm("Start a fresh project? Current build will be cleared.")) return;
    setHtml(null);
    setMeta(null);
    setMessages([]);
    setStage("idle");
    setView("chat");
    setError(null);
    setWarning(null);
    setMockups([]);
    localStorage.removeItem("lurk-project");
  };

  const isWorking = isBuilding && stage !== "done" && stage !== "error";

  return (
    <div className="flex flex-col h-screen max-h-dvh overflow-hidden">
      <header className="shrink-0 border-b border-[#222] bg-[#0A0A0A] z-20">
        <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[#39FF6A] font-bold tracking-tight text-lg neon-text">Lurk</span>
              <Sparkles className="w-3.5 h-3.5 text-[#39FF6A] opacity-70" />
            </div>
            {meta && (
              <div className="hidden sm:flex items-center gap-2 ml-2 pl-3 border-l border-[#222] min-w-0">
                <span className="text-lg leading-none">{meta.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate max-w-[180px] lg:max-w-[280px]">{meta.name}</div>
                  <div className="text-[11px] text-[#666] truncate max-w-[220px] lg:max-w-[320px]">{meta.description}</div>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {html && (
              <>
                <button onClick={downloadHtml} className="neon-btn rounded-lg p-2 text-xs" title="Download HTML">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={resetProject} className="neon-btn rounded-lg p-2 text-xs" title="New project">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </>
            )}
            <div className="flex rounded-lg border border-[#222] overflow-hidden ml-1">
              <button
                onClick={() => setView("chat")}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium transition ${
                  view === "chat" ? "bg-[#39FF6A]/10 text-[#39FF6A]" : "text-[#888] hover:text-[#ccc]"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Chat</span>
              </button>
              <button
                onClick={() => setView("preview")}
                disabled={!html}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium transition border-l border-[#222] ${
                  view === "preview" ? "bg-[#39FF6A]/10 text-[#39FF6A]" : "text-[#888] hover:text-[#ccc] disabled:opacity-40"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Preview</span>
              </button>
            </div>
          </div>
        </div>
        {meta && (
          <div className="sm:hidden flex items-center gap-2 px-3 pb-2 -mt-1">
            <span className="text-base">{meta.icon}</span>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{meta.name}</div>
              <div className="text-[10px] text-[#666] truncate">{meta.description}</div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 min-h-0 relative">
        {view === "chat" ? (
          <div className="h-full overflow-y-auto px-3 sm:px-4 py-4">
            <div className="max-w-2xl mx-auto space-y-3 pb-4">
              {messages.length === 0 && stage === "idle" && <Welcome />}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed animate-stage ${
                    m.role === "user" ? "msg-user ml-4 sm:ml-12" : "msg-assistant mr-4 sm:mr-12"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wider text-[#666] mb-1">
                    {m.role === "user" ? "You" : "Lurk"}
                  </div>
                  <div className="whitespace-pre-wrap">{renderMarkdownLite(m.content)}</div>
                </div>
              ))}
              {isWorking && (
                <div className="msg-assistant rounded-xl px-3.5 py-3 mr-4 sm:mr-12 animate-stage">
                  <div className="flex items-center gap-2 text-[#39FF6A] text-sm font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {STAGES.find((s) => s.key === stage)?.label || "Working…"}
                  </div>
                  {mockups.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {mockups.map((src, i) => (
                        <div
                          key={i}
                          className="rounded-lg overflow-hidden border border-[#222] bg-[#111] aspect-[4/3] flex items-center justify-center"
                          dangerouslySetInnerHTML={{ __html: src }}
                        />
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex gap-1.5">
                    {STAGES.map((s, i) => {
                      const currentIdx = STAGES.findIndex((x) => x.key === stage);
                      const done = i < currentIdx;
                      const active = s.key === stage;
                      return (
                        <div
                          key={s.key}
                          className={`h-1 flex-1 rounded-full transition-all ${
                            done ? "bg-[#39FF6A]" : active ? "bg-[#39FF6A] animate-pulse-neon" : "bg-[#222]"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
              {error && (
                <div className="rounded-xl px-3.5 py-2.5 text-sm border border-[#ff4d4d]/40 bg-[#ff4d4d]/10 text-[#ff8a8a]">
                  {error}
                </div>
              )}
              {warning && (
                <div className="rounded-xl px-3.5 py-2.5 text-sm border border-[#39FF6A]/30 bg-[#39FF6A]/05 text-[#a8ffc0]">
                  {warning}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col bg-[#050505]">
            {html ? (
              <iframe
                title="Lurk Preview"
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
                className="w-full h-full border-0 bg-white"
                srcDoc={html}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-[#555] text-sm">
                No preview yet — describe something to build
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t border-[#222] bg-[#0A0A0A] px-3 sm:px-4 py-3">
        <div className="max-w-2xl mx-auto">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-1.5 text-xs bg-[#151515] border border-[#222] rounded-lg px-2 py-1"
                >
                  {a.dataUrl && a.type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.dataUrl} alt="" className="w-6 h-6 rounded object-cover" />
                  ) : (
                    <Paperclip className="w-3 h-3 text-[#666]" />
                  )}
                  <span className="truncate max-w-[100px]">{a.name}</span>
                  <button onClick={() => removeAttachment(a.id)} className="text-[#666] hover:text-[#ff4d4d]">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="neon-btn rounded-xl p-2.5 shrink-0"
              title="Attach file"
              disabled={isBuilding}
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.txt,.md,.json,.csv"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="flex-1 relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={
                  html
                    ? "Ask for changes… (e.g. make the header sticky, add a score counter)"
                    : "Describe an app, website, or game…"
                }
                rows={1}
                disabled={isBuilding}
                className="lurk-input w-full resize-none rounded-xl bg-[#111] border border-[#222] px-3.5 py-2.5 text-sm text-[#e8e8e8] placeholder:text-[#555] max-h-32 min-h-[42px]"
                style={{ height: "auto" }}
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = "auto";
                  t.style.height = Math.min(t.scrollHeight, 128) + "px";
                }}
              />
            </div>
            <button
              onClick={submit}
              disabled={!prompt.trim() || isBuilding}
              className="neon-btn-filled rounded-xl p-2.5 shrink-0"
              title="Build"
            >
              {isBuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-[#444] text-center mt-2">
            Lurk builds real HTML/CSS/JS · Works offline in demo mode · Add{" "}
            <code className="text-[#555]">OPENROUTER_API_KEY</code> for full AI
          </p>
        </div>
      </footer>
    </div>
  );
}

function Welcome() {
  const examples = [
    "A pixel art snake game with high score",
    "SaaS landing page for an AI note-taking app",
    "Todo app with categories and dark mode",
    "Browser flappy-bird style game",
  ];
  return (
    <div className="text-center py-10 sm:py-16 animate-stage">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border border-[#39FF6A]/40 bg-[#39FF6A]/05 neon-glow mb-5">
        <Sparkles className="w-7 h-7 text-[#39FF6A]" />
      </div>
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">
        What do you want to <span className="neon-text">build</span>?
      </h1>
      <p className="text-[#777] text-sm max-w-md mx-auto mb-8">
        Describe a website, web app, or browser game. Lurk plans, codes, and previews it live — then you iterate in chat.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto text-left">
        {examples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              const el = document.querySelector("textarea");
              if (el) {
                const native = Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype,
                  "value"
                )?.set;
                native?.call(el, ex);
                el.dispatchEvent(new Event("input", { bubbles: true }));
              }
            }}
            className="text-left text-xs sm:text-sm rounded-xl border border-[#222] bg-[#111] hover:border-[#39FF6A]/40 hover:bg-[#39FF6A]/05 px-3 py-2.5 text-[#aaa] transition"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function renderMarkdownLite(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="text-[#39FF6A] font-semibold">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function generateMockupSvg(variant: number): string {
  const accent = ["#39FF6A", "#1a8f3a"][variant % 2];
  const bars = [40, 65, 50, 80, 35, 55];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" width="100%" height="100%">
  <rect width="200" height="150" fill="#0d0d0d"/>
  <rect x="8" y="8" width="184" height="18" rx="3" fill="#1a1a1a"/>
  <circle cx="18" cy="17" r="3" fill="${accent}"/>
  <rect x="28" y="14" width="40" height="6" rx="2" fill="#333"/>
  <rect x="8" y="34" width="80" height="50" rx="4" fill="#151515" stroke="${accent}" stroke-opacity="0.3"/>
  <rect x="96" y="34" width="96" height="22" rx="3" fill="#151515"/>
  <rect x="96" y="62" width="96" height="22" rx="3" fill="#151515"/>
  ${bars.map((h, i) => `<rect x="${12 + i * 12}" y="${140 - h * 0.7}" width="8" height="${h * 0.7}" rx="1" fill="${accent}" opacity="${0.3 + i * 0.1}"/>`).join("")}
  <text x="100" y="130" text-anchor="middle" fill="#444" font-size="8" font-family="system-ui">concept</text>
</svg>`;
}
