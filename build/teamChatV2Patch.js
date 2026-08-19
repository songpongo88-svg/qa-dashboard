export function teamChatV2Patch() {
  return {
    name: "team-chat-v2",
    enforce: "pre",
    transform(code, id) {
      return null;
    },
  };
}
