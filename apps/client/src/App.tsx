import { useEffect, useRef, useState } from "react";
import { fetchLanguages, summarizeVideo, type Language, type SummaryResponse } from "./api";
import { Markdown } from "./Markdown";
import { downloadText, formatDuration, safeFilename } from "./utils";

const progressMessages = [
  "Finding available captions",
  "Reconstructing caption fragments",
  "Mapping the full video",
  "Running the summarizer",
];

export default function App() {
  const [url, setUrl] = useState("");
  const [languages, setLanguages] = useState<Language[]>([]);
  const [language, setLanguage] = useState("");
  const [languageStatus, setLanguageStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SummaryResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!url.trim()) {
      setLanguages([]);
      setLanguage("");
      setLanguageStatus("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLanguageStatus("loading");
      try {
        const available = await fetchLanguages(url, controller.signal);
        setLanguages(available);
        const english = available.find((item) => item.code.split("-")[0] === "en");
        setLanguage(english?.code ?? available[0]?.code ?? "");
        setLanguageStatus("ready");
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setLanguages([]);
        setLanguage("");
        setLanguageStatus("idle");
      }
    }, 650);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [url]);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => setProgress((value) => Math.min(value + 1, progressMessages.length - 1)), 2_800);
    return () => window.clearInterval(timer);
  }, [loading]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    setProgress(0);
    try {
      const response = await summarizeVideo(url, language || undefined);
      setResult(response);
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to summarize this video.");
    } finally {
      setLoading(false);
    }
  }

  async function copySummary() {
    if (!result) return;
    await navigator.clipboard.writeText(result.summary.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="TubeDigest home">
          <span className="brand-mark">TD</span>
          <span>TubeDigest</span>
        </a>
        <a
          className="github-link"
          href="https://github.com/savxzthc/TubeDigest"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow"><span /> Transcript-first video summaries</div>
          <h1>Watch less.<br /><em>Understand more.</em></h1>
          <p className="hero-copy">
            Turn accessible YouTube captions into a complete, structured summary. No video download, no timeline scrubbing.
          </p>

          <form className="summary-form" onSubmit={handleSubmit}>
            <label htmlFor="video-url">YouTube video URL</label>
            <div className="url-row">
              <div className="input-wrap">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8ZM10 15.2V8.8l5.5 3.2-5.5 3.2Z" /></svg>
                <input
                  id="video-url"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  maxLength={2048}
                  required
                  disabled={loading}
                  autoComplete="url"
                />
              </div>
              <button className="primary-button" type="submit" disabled={loading || !url.trim()}>
                {loading ? "Working..." : "Summarize"}
                {!loading && <span aria-hidden="true">→</span>}
              </button>
            </div>

            <div className="form-footer">
              <div className="language-control">
                <label htmlFor="language">Caption language</label>
                <select
                  id="language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  disabled={loading || languages.length === 0}
                >
                  {languages.length === 0 && <option value="">English preferred</option>}
                  {languages.map((item) => (
                    <option key={`${item.code}-${item.isAutoGenerated}`} value={item.code}>
                      {item.name}
                      {item.isAutoGenerated && !item.name.toLowerCase().includes("auto-generated")
                        ? " (auto-generated)"
                        : ""}
                    </option>
                  ))}
                </select>
                {languageStatus === "loading" && <span className="checking">Checking captions...</span>}
              </div>
              <span className="privacy-note">Captions only. Video media is never downloaded.</span>
            </div>
          </form>

          {loading && (
            <div className="progress-card" role="status" aria-live="polite">
              <div className="spinner" />
              <div>
                <strong>{progressMessages[progress]}</strong>
                <span>Long videos are summarized section by section.</span>
              </div>
              <div className="progress-track"><span style={{ width: `${(progress + 1) * 24}%` }} /></div>
            </div>
          )}

          {error && <div className="error-card" role="alert"><strong>Could not summarize this video</strong><span>{error}</span></div>}
        </section>

        {!result && !loading && (
          <section className="features" aria-label="How TubeDigest works">
            <article><span>01</span><h2>Paste a link</h2><p>Watch, Shorts, mobile, and shortened YouTube URLs all work.</p></article>
            <article><span>02</span><h2>Captions, fast</h2><p>TubeDigest selects accessible captions and cleans transcript artifacts.</p></article>
            <article><span>03</span><h2>Get the full picture</h2><p>Receive an overview, details, sections, and practical takeaways.</p></article>
          </section>
        )}

        {result && (
          <section className="result-section" ref={resultRef}>
            <div className="result-header">
              <div>
                <span className="result-kicker">Summary ready</span>
                <h2>{result.video.title}</h2>
                <div className="metadata">
                  <span>{formatDuration(result.video.durationSeconds)}</span>
                  <span>{result.video.languageName}{result.video.isAutoGenerated ? " · Auto-generated" : ""}</span>
                  <span>{result.stats.chunks} section{result.stats.chunks === 1 ? "" : "s"}</span>
                  {result.summary.provider === "ollama" && (
                    <span className="provider-badge">Local AI · {result.summary.model}</span>
                  )}
                  {result.summary.provider === "extractive" && (
                    <span className="fallback-badge">Basic fallback</span>
                  )}
                </div>
              </div>
              <div className="result-actions">
                <button type="button" onClick={copySummary}>{copied ? "Copied" : "Copy"}</button>
                <button type="button" onClick={() => downloadText(safeFilename(result.video.title), result.summary.markdown)}>Download .txt</button>
              </div>
            </div>
            <article className="summary-paper"><Markdown content={result.summary.markdown} /></article>
          </section>
        )}
      </main>

      <footer>
        <span>TubeDigest</span>
        <p>Summaries are grounded in accessible caption text. Verify critical information against the original video.</p>
      </footer>
    </div>
  );
}
