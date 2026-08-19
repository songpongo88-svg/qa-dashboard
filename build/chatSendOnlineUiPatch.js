export function chatSendOnlineUiPatch() {
  let appPatched = false;
  let chatPatched = false;

  return {
    name: "chat-send-online-ui",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/App.tsx")) {
        const oldSend = `  const sendChatMessage = async (message: string, toUser?: OnlineUser, attachment?: ChatAttachment) => {
    if (!currentUser) return;
    await logUsageEvent(currentUser, "chat_message", {
      tab: "team-chat",
      target_agent: toUser?.username || "",
      details: {
        message,
        room: toUser ? "private" : "team",
        toUsername: toUser?.username || "",
        toDisplayName: toUser?.displayName || "",
        attachment,
      },
    });
    await sendPresence();
    await loadChatData();
  };`;

        const newSend = `  const sendChatMessage = async (message: string, toUser?: OnlineUser, attachment?: ChatAttachment) => {
    if (!currentUser) throw new Error("User session is not available.");

    const optimisticId = \`local-chat-\${currentUser.username}-\${Date.now()}-\${Math.random().toString(36).slice(2, 7)}\`;
    const optimisticMessage = {
      id: optimisticId,
      createdAt: new Date().toISOString(),
      username: currentUser.username,
      displayName: currentUser.displayName || currentUser.username,
      role: currentUser.role,
      message,
      room: toUser ? "private" : "team",
      toUsername: toUser?.username || "",
      toDisplayName: toUser?.displayName || "",
      attachment,
      kind: "message",
      deliveryStatus: "sending",
    } as ChatMessage & { deliveryStatus?: "sending" | "sent" | "failed" };

    setChatMessages((current) => [...current, optimisticMessage]);

    const savePromise = logUsageEvent(currentUser, "chat_message", {
      tab: "team-chat",
      target_agent: toUser?.username || "",
      details: {
        message,
        room: toUser ? "private" : "team",
        toUsername: toUser?.username || "",
        toDisplayName: toUser?.displayName || "",
        attachment,
      },
    });

    const saved = await Promise.race([
      savePromise,
      new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 8000)),
    ]);

    if (!saved) {
      setChatMessages((current) => current.map((item) =>
        item.id === optimisticId
          ? ({ ...item, deliveryStatus: "failed" } as ChatMessage & { deliveryStatus?: "sending" | "sent" | "failed" })
          : item
      ));
      throw new Error("Chat message could not be saved.");
    }

    setChatMessages((current) => current.map((item) =>
      item.id === optimisticId
        ? ({ ...item, deliveryStatus: "sent" } as ChatMessage & { deliveryStatus?: "sending" | "sent" | "failed" })
        : item
    ));

    void sendPresence();
    window.setTimeout(() => void loadChatData(), 200);
  };`;

        const oldCatch = `    } catch {
      setChatMessages([]);
      setOnlineUsers([]);
      setWebRtcSignals([]);
    }
  };`;
        const newCatch = `    } catch (error) {
      console.warn("Chat refresh failed; keeping the last visible chat state.", error);
    }
  };`;

        if (!code.includes(oldSend)) {
          throw new Error("Chat reliability patch: sendChatMessage anchor not found.");
        }
        let next = code.replace(oldSend, newSend);
        if (!next.includes(oldCatch)) {
          throw new Error("Chat reliability patch: loadChatData catch anchor not found.");
        }
        next = next.replace(oldCatch, newCatch);
        appPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/TeamChatV2.tsx")) {
        let next = code;

        const replacements = [
          [
            '  const [contactView, setContactView] = useState<"recent" | "people" | "teams">("recent");',
            '  const [contactView, setContactView] = useState<"recent" | "online" | "people" | "teams">("recent");',
          ],
          [
            '    if (contactView === "recent") rows = rows.filter((user) => user.lastMessageAt || user.unread > 0 || user.online);',
            '    if (contactView === "recent") rows = rows.filter((user) => user.lastMessageAt || user.unread > 0 || user.online);\n    if (contactView === "online") rows = rows.filter((user) => user.online);',
          ],
          [
            '              {(["recent", "people", "teams"] as const).map((view) => (',
            '              {(["recent", "online", "people", "teams"] as const).map((view) => (',
          ],
          [
            '            <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/70 p-1">',
            '            <div className="mt-3 grid grid-cols-4 gap-1 rounded-2xl bg-slate-200/70 p-1">',
          ],
          [
            '  const roomTitle = selectedUser ? selectedUser.displayName : "QA Dashboard Team Room";',
            '  const roomTitle = selectedUser ? selectedUser.displayName : "All Team";',
          ],
          [
            ': `${onlineUsers.length} online · Messages visible to everyone in Team Chat`;',
            ': `${onlineRoster.length} online · Messages visible to everyone in Team Chat`;',
          ],
          [
            '{onlineUsers.length} online · Shared room',
            '{onlineRoster.length} online · Shared room',
          ],
          [
            'Online {contacts.filter((user) => user.online).length}',
            'Online {onlineRoster.length}',
          ],
          [
            '<div className="mt-2 text-4xl font-black">{onlineUsers.length}</div>',
            '<div className="mt-2 text-4xl font-black">{onlineRoster.length}</div>',
          ],
        ];

        for (const [before, after] of replacements) {
          if (!next.includes(before)) {
            throw new Error(`Chat online UI patch anchor not found: ${before.slice(0, 90)}`);
          }
          next = next.replace(before, after);
        }

        const teamGroupsAnchor = '  const teamGroups = useMemo(() => {';
        const onlineRosterBlock = `  const onlineRoster = useMemo(() => {
    const map = new Map<string, { username: string; displayName: string; role: string; agentName: string; lastSeenAt: string }>();
    onlineUsers.forEach((user) => {
      const key = user.username.trim().toLowerCase();
      if (!key) return;
      map.set(key, user);
    });
    if (!map.has(myUsername)) {
      map.set(myUsername, {
        username: currentUser.username,
        displayName: currentUser.displayName || currentUser.username,
        role: currentUser.role,
        agentName: currentUser.agentName || currentUser.displayName || currentUser.username,
        lastSeenAt: new Date().toISOString(),
      });
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.username.trim().toLowerCase() === myUsername) return -1;
      if (b.username.trim().toLowerCase() === myUsername) return 1;
      return (a.displayName || a.username).localeCompare(b.displayName || b.username, "th");
    });
  }, [currentUser.agentName, currentUser.displayName, currentUser.role, currentUser.username, myUsername, onlineUsers]);

  const onlineContacts = useMemo(() => contacts.filter((user) => user.online), [contacts]);

`;
        if (!next.includes(teamGroupsAnchor)) throw new Error("Chat online roster insertion anchor not found.");
        next = next.replace(teamGroupsAnchor, onlineRosterBlock + teamGroupsAnchor);

        const oldSubmit = `  const handleSubmit = async () => {
    const message = draft.trim();
    if ((!message && !attachment) || sending) return;
    setSending(true);
    setError("");
    try {
      const recipient = selectedUser
        ? ({
            username: selectedUser.username,
            displayName: selectedUser.displayName,
            role: selectedUser.role,
            agentName: selectedUser.agentName || selectedUser.displayName,
            lastSeenAt: selectedUser.lastSeenAt || "",
          } as OnlineUser)
        : undefined;
      await onSendMessage(message, recipient, attachment);
      setDraft("");
      setAttachment(undefined);
    } catch {
      setError("Message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };`;

        const newSubmit = `  const handleSubmit = () => {
    const message = draft.trim();
    if (!message && !attachment) return;
    const outgoingAttachment = attachment;
    const recipient = selectedUser
      ? ({
          username: selectedUser.username,
          displayName: selectedUser.displayName,
          role: selectedUser.role,
          agentName: selectedUser.agentName || selectedUser.displayName,
          lastSeenAt: selectedUser.lastSeenAt || "",
        } as OnlineUser)
      : undefined;

    setDraft("");
    setAttachment(undefined);
    setError("");

    void onSendMessage(message, recipient, outgoingAttachment).catch(() => {
      setDraft((current) => current || message);
      if (outgoingAttachment) setAttachment((current) => current || outgoingAttachment);
      setError("Message could not be sent. Your text was restored so you can try again.");
    });
  };`;

        if (!next.includes(oldSubmit)) throw new Error("Chat send UI patch: handleSubmit anchor not found.");
        next = next.replace(oldSubmit, newSubmit);

        const headerAnchor = `                <div className="truncate text-base font-black text-slate-950">{roomTitle}</div>
                <div className="mt-0.5 truncate text-xs font-medium text-slate-500">{roomSubtitle}</div>`;
        const headerReplacement = `                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-base font-black text-slate-950">{roomTitle}</div>
                  {!selectedUser ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {onlineRoster.slice(0, 4).map((user) => {
                        const isMe = user.username.trim().toLowerCase() === myUsername;
                        return (
                          <button
                            key={user.username}
                            type="button"
                            onClick={() => { if (!isMe) setSelectedUsername(user.username); }}
                            className={\`inline-flex max-w-[150px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold \${isMe ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700"}\`}
                          >
                            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                            <span className="truncate">{user.displayName || user.username}{isMe ? " (You)" : ""}</span>
                          </button>
                        );
                      })}
                      {onlineRoster.length > 4 ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">+{onlineRoster.length - 4}</span> : null}
                    </div>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-xs font-medium text-slate-500">{roomSubtitle}</div>`;
        if (!next.includes(headerAnchor)) throw new Error("Chat online header anchor not found.");
        next = next.replace(headerAnchor, headerReplacement);

        const listAnchor = '              <div className="max-h-[560px] overflow-y-auto pr-1">';
        const leftOnline = `              <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">Online Now</span>
                  <span className="text-[10px] font-bold text-emerald-700">{onlineRoster.length}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />{currentUser.displayName || currentUser.username} (You)</span>
                  {onlineContacts.slice(0, 4).map((user) => (
                    <button key={user.username} type="button" onClick={() => setSelectedUsername(user.username)} className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:border-violet-200 hover:text-violet-700"><span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><span className="truncate">{user.displayName}</span></button>
                  ))}
                  {onlineContacts.length > 4 ? <button type="button" onClick={() => setContactView("online")} className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">+{onlineContacts.length - 4}</button> : null}
                </div>
              </div>

`;
        if (!next.includes(listAnchor)) throw new Error("Chat left online section anchor not found.");
        next = next.replace(listAnchor, leftOnline + listAnchor);

        const timeAnchor = `<span>{formatChatTime(message.createdAt)}{message.edited ? " · edited" : ""}</span>`;
        const timeReplacement = `<span>{formatChatTime(message.createdAt)}{message.edited ? " · edited" : ""}{(message as ChatMessage & { deliveryStatus?: string }).deliveryStatus === "sending" ? " · Sending..." : (message as ChatMessage & { deliveryStatus?: string }).deliveryStatus === "sent" ? " · ✓ Sent" : (message as ChatMessage & { deliveryStatus?: string }).deliveryStatus === "failed" ? " · Failed" : ""}</span>`;
        if (!next.includes(timeAnchor)) throw new Error("Chat delivery status anchor not found.");
        next = next.replace(timeAnchor, timeReplacement);

        chatPatched = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd() {
      if (!appPatched) throw new Error("Chat send reliability patch was not applied to App.tsx.");
      if (!chatPatched) throw new Error("Chat online UI patch was not applied to TeamChatV2.tsx.");
    },
  };
}
