export function Message({ message }) {
  if (!message) return null;

  const icons = {
    error: "!",
    warning: "!",
    success: "✓",
  };

  const icon = icons[message.type] || "i";
  const tone =
    message.type === "error"
      ? "error"
      : message.type === "warning"
        ? "warning"
        : message.type === "success"
          ? "success"
          : "";

  return (
    <div className={`message ${tone}`} role="alert">
      <span className="message-icon">{icon}</span>
      <span className="message-text">{message.text}</span>
    </div>
  );
}
