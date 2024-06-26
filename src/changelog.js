import fs from 'fs';

import { parser as keepAChangelogParser } from 'keep-a-changelog';
import semver from 'semver';

import ChangelogValidationError from './changelogValidationError.js';

const ENCODING = 'UTF-8';

export default class Changelog {
  static INITIAL_VERSION = '0.0.0';
  static NO_RELEASE_TAG = 'no-release';
  static UNRELEASED_REGEX = new RegExp(`## Unreleased[ ]+\\[(major|minor|patch|${Changelog.NO_RELEASE_TAG})\\]`, 'i');
  static NO_RELEASE_SIGNATURE_REGEX = /^_Modifications made in this changeset do not add, remove or alter any behavior, dependency, API or functionality of the software. They only change non-functional parts of the repository, such as the README file or CI workflows._$/m;
  static FUNDERS_REGEX = /^> Development of this release was (?:supported|made on a volunteer basis) by (.+)\.$/m;

  constructor({ changelogPath, noReleaseSignatureRegex, fundersRegex }) {
    this.changelogPath = changelogPath;
    this.rawContent = fs.readFileSync(changelogPath, ENCODING);

    this.noReleaseSignatureRegex = noReleaseSignatureRegex === false ? false : (noReleaseSignatureRegex instanceof RegExp && noReleaseSignatureRegex) || Changelog.NO_RELEASE_SIGNATURE_REGEX;
    this.fundersRegex = fundersRegex === false ? false : (fundersRegex instanceof RegExp && fundersRegex) || Changelog.FUNDERS_REGEX;

    this.changelog = keepAChangelogParser(this.rawContent);
    this.changelog.format = 'markdownlint';

    this.releaseType = this.extractReleaseType();
    this.nextVersion = this.getNextVersion();
  }

  extractReleaseType() {
    const match = this.rawContent.match(Changelog.UNRELEASED_REGEX);

    if (match && match[1]) {
      return match[1].toLowerCase();
    }

    return null;
  }

  getVersionContent(version) {
    const release = this.changelog.findRelease(version);

    if (!release) {
      throw new Error(`Version ${version} not found in changelog`);
    }

    return release.toString(this.changelog);
  }

  release(notice) {
    const unreleased = this.changelog.findRelease();

    if (!unreleased) {
      return {
        version: undefined,
        content: undefined,
      };
    }

    let version;
    let content;

    if (this.releaseType == Changelog.NO_RELEASE_TAG) {
      const index = this.changelog.releases.findIndex(release => !release.version);

      this.changelog.releases.splice(index, 1);
    } else {
      version = this.nextVersion;

      unreleased.setVersion(version);
      unreleased.date = new Date();

      if (notice) {
        unreleased.description = `_${notice}_\n\n${unreleased.description}`;
      }

      content = unreleased.toString(this.changelog);
    }

    fs.writeFileSync(this.changelogPath, this.toString(), ENCODING);

    return {
      version,
      content,
    };
  }

  validateUnreleased() {
    const unreleased = this.changelog.findRelease();
    const errors = [];

    if (!unreleased) {
      errors.push(new Error('Missing "Unreleased" section'));
      throw new ChangelogValidationError(errors);
    }

    if (!this.releaseType) {
      errors.push(new Error(`Invalid or missing release type for "Unreleased" section. Please ensure the section contains a valid release type (major, minor, patch or ${Changelog.NO_RELEASE_TAG})`));
    }

    if (this.releaseType == Changelog.NO_RELEASE_TAG) {
      if (this.noReleaseSignatureRegex && !this.noReleaseSignatureRegex.test(unreleased.description)) {
        errors.push(new Error('Missing no release signature'));
      }
    } else {
      if (this.fundersRegex && !this.fundersRegex.test(unreleased.description)) {
        errors.push(new Error('Missing funder in the "Unreleased" section'));
      }

      if (!unreleased.changes || Array.from(unreleased.changes.values()).every(change => !change.length)) {
        errors.push(new Error('Missing or malformed changes in the "Unreleased" section'));
      }
    }

    if (errors.length) {
      throw new ChangelogValidationError(errors);
    }
  }

  getNextVersion() {
    const latestVersion = semver.maxSatisfying(this.changelog.releases.map(release => release.version), '*') || Changelog.INITIAL_VERSION;

    return this.releaseType != Changelog.NO_RELEASE_TAG ? semver.inc(latestVersion, this.releaseType) : latestVersion;
  }

  toString() {
    return this.changelog.description ? this.changelog.toString() : this.changelog.toString().replace(/(^#\s.*?\n)([\s\S]*?)(?=\n##\s)/, '$1'); // Remove default description added by `keep-a-changelog` if no introduction is present
  }
}
