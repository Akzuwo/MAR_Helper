import changelogData from '../../changelog.json';
import { findChangelogRelease, parseChangelog, type ChangelogRelease } from '../shared/update-utils';

export { parseChangelog } from '../shared/update-utils';
export type { ChangelogRelease } from '../shared/update-utils';

export const changelog = parseChangelog(changelogData);

export const getChangelogRelease = (version: string): ChangelogRelease | undefined => {
  return findChangelogRelease(changelogData, version);
};

const CHANGELOG_SEEN_KEY = 'mar-helper:last-seen-changelog-version';

export const hasSeenChangelogVersion = (version: string): boolean => {
  try {
    return window.localStorage.getItem(CHANGELOG_SEEN_KEY) === version;
  } catch {
    return false;
  }
};

export const markChangelogVersionSeen = (version: string): void => {
  try {
    window.localStorage.setItem(CHANGELOG_SEEN_KEY, version);
  } catch {
    // Ein deaktivierter Web-Speicher darf die App nicht am Start hindern.
  }
};
