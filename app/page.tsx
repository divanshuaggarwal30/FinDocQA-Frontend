"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  Loader2,
  MessageSquareText,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Mode = "mock" | "real";

type DocumentInfo = {
  filename: string;
  pages: number;
  chunks: number;
};

type Answer = {
  answer: string;
  page_number: number;
  exact_quote: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: {
    page: number;
    quote: string;
  };
};

const API_BASE_URL = "https://findocqa-backend.onrender.com";
const API_MODE: Mode = "real";

const MOCK_ANSWERS: Record<string, Answer> = {
  default: {
    answer: "The report indicates that the change was primarily driven by stronger operating performance and higher demand.",
    page_number: 9,
    exact_quote: "Revenue growth was primarily driven by higher demand across our core business segments.",
  }
};

function getMockAnswer(question: string): Answer {
  return MOCK_ANSWERS.default;
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [documentInfo, setDocumentInfo] = useState<DocumentInfo | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [chatError, setChatError] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);

  const documentReady = Boolean(uploadedFile && documentInfo);

  const suggestedQuestions = useMemo(
    () => [
      "What were the main drivers of revenue growth?",
      "Can you provide a breakdown of the Q3 revenue in a table?",
      "How did operating expenses change?",
    ],
    []
  );

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) processFile(file);
    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  async function processFile(file: File) {
    setUploadError("");
    setChatError("");

    if (file.type !== "application/pdf") {
      setUploadError("Please select a PDF document.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError("This file is larger than the 50 MB limit.");
      return;
    }

    setIsUploading(true);

    try {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);

      const objectUrl = URL.createObjectURL(file);
      setPdfUrl(objectUrl);
      setUploadedFile(file);
      setMessages([]);
      setCurrentPage(1);
      setZoom(100);

      if (API_MODE === "mock") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setDocumentInfo({ filename: file.name, pages: 87, chunks: 214 });
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);
      const data = await response.json();

      setDocumentInfo({
        filename: data.filename || file.name,
        pages: Number(data.pages) || 1,
        chunks: Number(data.chunks) || 0,
      });
    } catch (error) {
      console.error(error);
      setUploadedFile(null);
      setDocumentInfo(null);
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
      setUploadError("Could not connect to the backend. Make sure the FastAPI server is running.");
    } finally {
      setIsUploading(false);
    }
  }

  async function askQuestion(event?: FormEvent<HTMLFormElement>, customQuestion?: string) {
    event?.preventDefault();
    const query = (customQuestion ?? question).trim();

    if (!query || !documentReady || isAsking) return;

    setChatError("");
    setIsAsking(true);

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: query };
    setMessages((previous) => [...previous, userMessage]);
    setQuestion("");

    try {
      let result: Answer;

      if (API_MODE === "mock") {
        await new Promise((resolve) => setTimeout(resolve, 850));
        result = getMockAnswer(query);
      } else {
        const response = await fetch(`${API_BASE_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        if (!response.ok) throw new Error(`Chat failed with status ${response.status}`);
        const data = await response.json();

        result = {
          answer: data.answer || "No answer was returned.",
          page_number: Number(data.page_number) || 1,
          exact_quote: data.exact_quote || data.quote || "No supporting excerpt was returned.",
        };
      }

      const safePage = Math.min(Math.max(result.page_number, 1), documentInfo?.pages || result.page_number);
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.answer,
        source: { page: safePage, quote: result.exact_quote },
      };

      setMessages((previous) => [...previous, assistantMessage]);
      setCurrentPage(safePage);
    } catch (error) {
      console.error(error);
      setChatError("The document service could not answer this question.");
    } finally {
      setIsAsking(false);
    }
  }

  function jumpToPage(page: number) {
    if (!documentInfo) return;
    const nextPage = Math.min(Math.max(page, 1), documentInfo.pages);
    setCurrentPage(nextPage);
  }

  function resetSession() {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setUploadedFile(null);
    setPdfUrl(null);
    setDocumentInfo(null);
    setMessages([]);
    setQuestion("");
    setCurrentPage(1);
    setZoom(100);
    setUploadError("");
    setChatError("");
  }

  if (!documentReady) {
    return (
      <main className="min-h-screen bg-[#080b12] text-[#f4f5f7]">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-48 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-indigo-500/[0.045] blur-[120px]" />
        </div>
        <header className="relative mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.035]">
              <FileText size={18} strokeWidth={1.7} />
            </div>
            <div>
              <div className="text-[15px] font-semibold tracking-[-0.02em]">FinDocQA</div>
              <div className="hidden text-[10px] uppercase tracking-[0.16em] text-white/35 sm:block">Document intelligence</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[11px] text-white/45 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Private session
            </div>
            <div className="text-[11px] text-white/30">{API_MODE === "mock" ? "Demo mode" : "Connected"}</div>
          </div>
        </header>

        <section className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center px-6 pb-20 pt-8 lg:px-10">
          <div className="w-full">
            <div className="mb-10 max-w-2xl">
              <div className="mb-5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-indigo-300/75">
                <span className="h-px w-7 bg-indigo-400/60" /> Financial document research
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-white sm:text-5xl lg:text-[60px]">
                Ask the report.<br /><span className="text-white/42">See the evidence.</span>
              </h1>
              <p className="mt-6 max-w-xl text-[15px] leading-7 text-white/45">
                Upload a financial report and ask questions in plain language. Every answer is tied back to the exact page.
              </p>
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative overflow-hidden rounded-2xl border transition-all duration-200 ${isDragging ? "border-indigo-400/70 bg-indigo-400/[0.06]" : "border-white/[0.10] bg-[#0d111a]"}`}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
              <div className="grid min-h-[330px] lg:grid-cols-[1fr_300px]">
                <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-14">
                  <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.035]">
                    <Upload size={19} strokeWidth={1.6} className="text-white/70" />
                  </div>
                  <h2 className="text-xl font-medium tracking-[-0.02em]">
                    {isDragging ? "Drop your report here" : "Upload a financial document"}
                  </h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-white/40">10-Ks, annual reports, earnings reports, and other text-based financial PDFs.</p>
                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={openFilePicker} disabled={isUploading} className="inline-flex h-11 items-center gap-2.5 rounded-lg bg-white px-5 text-sm font-semibold text-[#090c12] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50">
                      {isUploading ? <><Loader2 size={16} className="animate-spin" /> Processing</> : <><ArrowUpRight size={15} /> Choose PDF</>}
                    </button>
                    <span className="text-xs text-white/25">or drag and drop</span>
                  </div>
                  <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFileInput} className="hidden" />
                  {uploadError && (
                    <div className="mt-5 flex max-w-lg items-start gap-2.5 rounded-lg border border-red-400/15 bg-red-400/[0.05] px-3.5 py-3 text-xs text-red-200/75">
                      <CircleAlert size={15} className="mt-0.5 shrink-0" />
                      <span>{uploadError}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-white/[0.07] bg-white/[0.018] p-8 lg:border-l lg:border-t-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">How it works</div>
                  <div className="mt-8 space-y-7">
                    {[
                      ["01", "Upload", "Add the report you want to research."],
                      ["02", "Ask", "Ask questions about its contents."],
                      ["03", "Verify", "Trace answers back to the source."],
                    ].map(([number, title, description]) => (
                      <div key={number} className="flex gap-4">
                        <span className="font-mono text-[10px] text-white/25">{number}</span>
                        <div>
                          <div className="text-sm font-medium text-white/80">{title}</div>
                          <div className="mt-1 text-xs leading-5 text-white/35">{description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-screen min-h-[700px] flex-col overflow-hidden bg-[#090c12] text-[#f4f5f7]">
      <header className="z-20 flex h-[68px] shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#090c12] px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.025]">
            <FileText size={17} className="text-white/75" />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-[-0.02em]">FinDocQA</div>
            <div className="hidden max-w-[280px] truncate text-[10px] text-white/30 sm:block">{documentInfo?.filename}</div>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <button type="button" onClick={resetSession} className="ml-2 inline-flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/45 transition hover:border-white/[0.15] hover:text-white/75">
            <RotateCcw size={13} /> New document
          </button>
        </div>
        <button type="button" onClick={resetSession} className="md:hidden" aria-label="New document">
          <X size={18} className="text-white/40" />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[450px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-white/[0.08] bg-[#0b0f16] lg:border-b-0 lg:border-r">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            {messages.length === 0 ? (
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-white/55">
                  <MessageSquareText size={14} /> Ask about the report
                </div>
                <div className="mt-7 space-y-2">
                  {suggestedQuestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => askQuestion(undefined, item)}
                      disabled={isAsking}
                      className="group w-full rounded-lg border border-white/[0.07] bg-white/[0.018] px-3.5 py-3 text-left text-xs leading-5 text-white/45 transition hover:border-white/[0.14] hover:bg-white/[0.035] hover:text-white/75 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>{item}</span>
                      <ArrowUpRight size={13} className="mt-1 float-right opacity-0 transition group-hover:opacity-60" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-7">
                {messages.map((message) => (
                  <div key={message.id}>
                    {message.role === "user" ? (
                      <div>
                        <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/25">You</div>
                        <div className="text-[13px] leading-6 text-white/75">{message.content}</div>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-indigo-300/60">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400/70" /> Answer
                        </div>

                        {/* REACT MARKDOWN ADDED HERE FOR TABLES */}
                        <div className="text-[13px] leading-6 text-white/70">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              table: ({node, ...props}) => (
                                <div className="overflow-x-auto my-3">
                                  <table className="min-w-full divide-y divide-white/10 border border-white/10 rounded-lg shadow-sm" {...props} />
                                </div>
                              ),
                              thead: ({node, ...props}) => <thead className="bg-white/[0.03]" {...props} />,
                              th: ({node, ...props}) => <th className="px-3 py-2 text-left text-[11px] font-semibold tracking-wider text-white/50 uppercase" {...props} />,
                              td: ({node, ...props}) => <td className="px-3 py-2 whitespace-nowrap text-[12px] text-white/70 border-t border-white/5" {...props} />,
                              p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>

                        {message.source && (
                          <button
                            type="button"
                            onClick={() => jumpToPage(message.source!.page)}
                            className="group mt-4 w-full overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02] text-left transition hover:border-indigo-300/25 hover:bg-indigo-300/[0.025]"
                          >
                            <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/30">Source</span>
                                <span className="font-mono text-[10px] text-indigo-300/75">p. {message.source.page}</span>
                              </div>
                              <ArrowUpRight size={13} className="text-white/25 transition group-hover:text-indigo-300/80" />
                            </div>
                            <div className="px-3.5 py-3">
                              <p className="line-clamp-3 text-[11px] leading-5 text-white/40">“{message.source.quote}”</p>
                            </div>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {isAsking && (
                  <div>
                    <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-indigo-300/60">Answer</div>
                    <div className="flex items-center gap-2 text-xs text-white/30"><Loader2 size={13} className="animate-spin" /> Searching...</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.07] p-4">
            {chatError && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-400/15 bg-red-400/[0.04] px-3 py-2.5 text-[11px] text-red-200/70">
                <CircleAlert size={13} className="mt-0.5 shrink-0" />
                {chatError}
              </div>
            )}
            <form onSubmit={askQuestion}>
              <div className="relative rounded-xl border border-white/[0.09] bg-[#080b11] transition focus-within:border-white/[0.17]">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  disabled={isAsking}
                  rows={3}
                  placeholder="Ask a question about the report…"
                  className="w-full resize-none bg-transparent px-4 pb-12 pt-3.5 text-[12px] leading-5 text-white outline-none placeholder:text-white/20 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!question.trim() || isAsking}
                  className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#090c12] transition hover:bg-white/90 disabled:opacity-20"
                >
                  {isAsking ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpRight size={15} />}
                </button>
              </div>
            </form>
          </div>
        </aside>

        <section className="relative flex min-h-0 flex-col bg-[#11151d]">
          <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0d1118] px-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25 sm:block">Document</div>
              <div className="h-3 w-px bg-white/[0.08]" />
              <div className="flex min-w-0 items-center gap-2">
                <FileText size={13} className="shrink-0 text-white/30" />
                <span className="max-w-[180px] truncate text-[11px] text-white/45 sm:max-w-[300px]">{documentInfo?.filename}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setZoom((v) => Math.max(60, v - 10))} disabled={zoom <= 60} className="flex h-8 w-8 items-center justify-center rounded-md text-white/30 hover:bg-white/[0.05] disabled:opacity-20"><Minus size={14} /></button>
              <span className="w-10 text-center font-mono text-[10px] text-white/35">{zoom}%</span>
              <button onClick={() => setZoom((v) => Math.min(160, v + 10))} disabled={zoom >= 160} className="flex h-8 w-8 items-center justify-center rounded-md text-white/30 hover:bg-white/[0.05] disabled:opacity-20"><Plus size={14} /></button>
              <div className="mx-2 h-4 w-px bg-white/[0.07]" />
              <button onClick={() => jumpToPage(currentPage - 1)} disabled={currentPage <= 1} className="flex h-8 w-8 items-center justify-center rounded-md text-white/30 hover:bg-white/[0.05] disabled:opacity-20"><ChevronLeft size={15} /></button>
              <div className="min-w-[70px] text-center font-mono text-[10px] text-white/45">{currentPage} <span className="text-white/20">/ {documentInfo?.pages}</span></div>
              <button onClick={() => jumpToPage(currentPage + 1)} disabled={currentPage >= (documentInfo?.pages || 1)} className="flex h-8 w-8 items-center justify-center rounded-md text-white/30 hover:bg-white/[0.05] disabled:opacity-20"><ChevronRight size={15} /></button>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#1a1e26]">
            {pdfUrl && (
              <iframe
                key={`${pdfUrl}-${currentPage}-${zoom}`}
                src={`${pdfUrl}#page=${currentPage}&zoom=${zoom}`}
                title="Financial report"
                className="h-full w-full border-0"
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}