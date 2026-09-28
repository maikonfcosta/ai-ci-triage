import { Octokit } from '@octokit/rest';
import { MARKER } from './comment';

export type PullRef = { owner: string; repo: string; pull: number };

export async function pullDiff(octokit: Octokit, ref: PullRef): Promise<string> {
  const res = await octokit.rest.pulls.get({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.pull,
    mediaType: { format: 'diff' },
  });
  // With the diff media type the body is the raw diff text, not the JSON the types describe.
  return res.data as unknown as string;
}

/** One comment per PR: the one carrying the marker is edited, so reruns never pile up. */
export async function upsertComment(octokit: Octokit, ref: PullRef, body: string): Promise<'created' | 'updated'> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: ref.owner,
    repo: ref.repo,
    issue_number: ref.pull,
    per_page: 100,
  });
  const mine = comments.find((c) => c.body?.startsWith(MARKER));
  if (mine) {
    await octokit.rest.issues.updateComment({ owner: ref.owner, repo: ref.repo, comment_id: mine.id, body });
    return 'updated';
  }
  await octokit.rest.issues.createComment({ owner: ref.owner, repo: ref.repo, issue_number: ref.pull, body });
  return 'created';
}

type PullRequestEvent = {
  pull_request?: { number: number; head: { repo: { full_name: string } | null }; base: { repo: { full_name: string } } };
};

/** Same-repo pull requests only: a fork must never run with the model keys. */
export function pullFromEvent(eventName: string, event: PullRequestEvent): { ref: PullRef } | { skip: string } {
  if (eventName !== 'pull_request') return { skip: `event is "${eventName}", not "pull_request"` };
  const pr = event.pull_request;
  if (!pr) return { skip: 'the event has no pull request' };
  const base = pr.base.repo.full_name;
  if (pr.head.repo?.full_name !== base) return { skip: `pull request comes from a fork (${pr.head.repo?.full_name ?? 'deleted repo'})` };
  const [owner, repo] = base.split('/');
  return { ref: { owner, repo, pull: pr.number } };
}
