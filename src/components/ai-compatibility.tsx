const faces = [
  { name: "Claude", logo: "claude", color: "coral" },
  { name: "ChatGPT", logo: "chatgpt", color: "mint" },
  { name: "Cursor", logo: "cursor", color: "lilac" },
  { name: "Your AI", logo: null, color: "neutral" },
];
export default function AiCompatibility() {
  return (
    <div className="sf-compatibility">
      <div
        className="sf-works-with"
        tabIndex={0}
        role="img"
        aria-label="Works with Claude, ChatGPT, Cursor, and other assistants that support remote MCP. Rotation pauses on hover or focus."
      >
        <span>Works with</span>
        <div className="sf-ai-cube" aria-hidden="true">
          <div className="sf-ai-cube-rotor">
            {faces.map((face, index) => (
              <span
                key={face.name}
                className={`sf-ai-cube-face sf-ai-${face.color}`}
                style={{ "--face": index } as React.CSSProperties}
              >
                {face.logo ? (
                  <img
                    src={`/ai/${face.logo}.svg`}
                    width={28}
                    height={28}
                    alt=""
                  />
                ) : (
                  <span className="sf-mcp-mark">mcp</span>
                )}
                <strong>{face.name}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
