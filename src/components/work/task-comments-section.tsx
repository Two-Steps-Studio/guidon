"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Gavel, Loader2, Send } from "lucide-react";
import { loadComments as loadCommentsAction, postComment, type TaskComment } from "@/app/projects/[id]/work/comments-actions";
import { CreateDecisionDialog } from "@/app/projects/[id]/decisions/create-decision-dialog";
import { AttachmentImage } from "@/components/files/markdown-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTaskAttachments } from "@/components/work/task-attachments-context";
import { type TaskCardMember } from "@/components/work/task-card";
import { useImagePaste } from "@/components/work/use-image-paste";
import { initialsFor } from "@/lib/people";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/task";

/**
 * A task's comment thread plus the composer. Loads its own comments when
 * mounted (the dialog is keyed by task id, so a different task remounts
 * it). Images pasted or dropped into the composer become task attachments
 * (use-image-paste.ts) and render inline in the thread.
 */
export function TaskCommentsSection({
  projectId,
  task,
  members,
  canEdit,
  canComment,
  currentUserId,
  onDecisionCreated,
  onOpenImage,
}: {
  projectId: string;
  task: Task;
  members: TaskCardMember[];
  canEdit: boolean;
  canComment: boolean;
  currentUserId: string | null;
  /** A comment was turned into a decision - the dialog reloads its "Why" panel. */
  onDecisionCreated: () => void;
  /** Open an inline image in the dialog's full-screen viewer. */
  onOpenImage: (attachmentId: string) => void;
}) {
  const t = useTranslations("work");
  const { imageUrls } = useTaskAttachments();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [postError, setPostError] = useState<string | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const membersById = new Map(members.map((member) => [member.id, member]));

  const commentPaste = useImagePaste({
    fieldRef: commentInputRef,
    update: setDraft,
    enabled: canComment,
    onError: (message) => setPostError(message),
  });

  const loadComments = useCallback(
    async (taskId: string) => {
      try {
        const result = await loadCommentsAction(projectId, taskId);
        if (result.error) throw new Error(result.error);
        // Keep anything posted while the thread was still loading.
        setComments((current) => {
          const loaded = new Set(result.comments.map((comment) => comment.id));
          return [...result.comments, ...current.filter((comment) => !loaded.has(comment.id))];
        });
      } catch (err) {
        setCommentsError(err instanceof Error ? err.message : t("failedToLoadComments"));
      } finally {
        setCommentsLoading(false);
      }
    },
    [projectId, t]
  );

  // All state updates inside the loader happen after an await.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadComments(task.id);
  }, [task.id, loadComments]);

  // Optimistic: the comment shows (dimmed) the moment it's sent and the
  // composer is free for the next one; the server's row replaces it, or it's
  // taken back and the text returned to the composer if the post fails.
  const handleComment = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !currentUserId) return;

    const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();
    setComments((current) => [
      ...current,
      { id: pendingId, task_id: task.id, author_id: currentUserId, content, created_at: now, actor_label: null },
    ]);
    setPendingIds((current) => new Set(current).add(pendingId));
    setDraft("");
    setPostError(null);

    try {
      const result = await postComment(projectId, task.id, content);
      if (result.error || !result.comment) throw new Error(result.error ?? t("failedToPostComment"));
      const saved = result.comment as TaskComment;
      setComments((current) => current.map((comment) => (comment.id === pendingId ? saved : comment)));
    } catch (err) {
      setComments((current) => current.filter((comment) => comment.id !== pendingId));
      setDraft((current) => (current ? current : content));
      setPostError(err instanceof Error ? err.message : t("failedToPostComment"));
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(pendingId);
        return next;
      });
    }
  };

  return (
        <section
          aria-label={t("commentsAria")}
          className="space-y-3 border-t border-border pt-4"
        >
          <h3 className="text-sm font-medium text-foreground">
            {t("commentsHeading")}
            {comments.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {comments.length}
              </span>
            )}
          </h3>

          {commentsLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("loadingComments")}
            </p>
          ) : commentsError ? (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {commentsError}
            </p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noCommentsYet")}
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((comment) => {
                const author = membersById.get(comment.author_id);
                const isBot = Boolean(comment.actor_label);
                const pending = pendingIds.has(comment.id);

                return (
                  <li key={comment.id} className={cn("group flex gap-2.5", pending && "opacity-60")} aria-busy={pending || undefined}>
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-secondary-foreground"
                    >
                      {isBot ? <Bot className="h-3.5 w-3.5" /> : author ? initialsFor(author) : "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {comment.actor_label || author?.full_name || author?.email || t("unknownAuthor")}
                        </span>
                        {" · "}
                        {new Date(comment.created_at).toLocaleString()}
                        {canEdit && !pending && (
                          <CreateDecisionDialog
                            projectId={projectId}
                            idPrefix={`comment-decision-${comment.id}`}
                            defaults={{
                              title: comment.content.length > 60 ? `${comment.content.slice(0, 60)}…` : comment.content,
                              description: comment.content,
                            }}
                            link={{ sourceType: "task", sourceId: task.id }}
                            onCreated={onDecisionCreated}
                            trigger={
                              <button
                                type="button"
                                title={t("markAsDecision")}
                                aria-label={t("markCommentAsDecisionAria")}
                                className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                              >
                                <Gavel className="h-3 w-3" />
                              </button>
                            }
                          />
                        )}
                      </p>
                      <CommentContent
                        content={comment.content}
                        imageUrls={imageUrls}
                        onOpenImage={onOpenImage}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {postError && (
            <p role="alert" className="text-sm text-destructive">
              {postError}
            </p>
          )}

          {canComment && (
            <form onSubmit={handleComment} className="flex gap-2">
              <Input
                ref={commentInputRef}
                value={draft}
                placeholder={t("addCommentPlaceholder")}
                aria-label={t("addCommentAria")}
                onChange={(event) => setDraft(event.target.value)}
                onPaste={commentPaste.onPaste}
                onDragOver={commentPaste.onDragOver}
                onDrop={commentPaste.onDrop}
              />
              <Button
                type="submit"
                size="icon"
                aria-label={t("postCommentAria")}
                disabled={commentPaste.uploading || !draft.trim()}
                className={cn("shrink-0")}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          )}
        </section>
  );
}

const ATTACHMENT_IMAGE_RE = /!\[([^\]]*)\]\(attachment:([0-9a-f-]{36})\)/g;

/**
 * Comments stay plain text (no markdown - existing comments with `*` or `_`
 * must keep reading exactly as before); only `![name](attachment:<id>)`
 * references from pasted images are turned into inline images.
 */
function CommentContent({
  content,
  imageUrls,
  onOpenImage,
}: {
  content: string;
  imageUrls: Record<string, string>;
  onOpenImage: (attachmentId: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of content.matchAll(ATTACHMENT_IMAGE_RE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(content.slice(last, index));
    const id = match[2];
    parts.push(
      <AttachmentImage key={`${id}-${index}`} alt={match[1]} url={imageUrls[id]} onOpen={() => onOpenImage(id)} />
    );
    last = index + match[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));

  return <div className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{parts}</div>;
}
