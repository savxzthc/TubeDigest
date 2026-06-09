import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    nodes.push(<ul key={`list-${nodes.length}`}>{list.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>);
    list = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      return;
    }
    flushList();
    if (!line) return;
    if (line.startsWith("### ")) nodes.push(<h3 key={nodes.length}>{inline(line.slice(4))}</h3>);
    else if (line.startsWith("## ")) nodes.push(<h2 key={nodes.length}>{inline(line.slice(3))}</h2>);
    else if (line.startsWith("# ")) nodes.push(<h1 key={nodes.length}>{inline(line.slice(2))}</h1>);
    else if (line.startsWith("> ")) nodes.push(<blockquote key={nodes.length}>{inline(line.slice(2))}</blockquote>);
    else nodes.push(<p key={nodes.length}>{inline(line)}</p>);
  });
  flushList();
  return <div className="markdown">{nodes}</div>;
}
