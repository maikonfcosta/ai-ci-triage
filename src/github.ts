import { Octokit } from '@octokit/rest';

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
