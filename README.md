# GitHub Actions for changelog management

This codebase exposes two GitHub Actions that help automate validating changelog entries compliance and automatically releasing new versions based on changelog content. They are relevant to use within a [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow) development process with [SemVer](https://semver.org), enforcing the [Common Changelog](https://common-changelog.org/) specification.

## Actions

### `OpenTermsArchive/manage-changelog/validate`

This action validates that the contents of the `Unreleased` section of the changelog matches the [Common Changelog](https://common-changelog.org/) specification with [some additions](#enforced-format), and exposes the upcoming release type.

#### Example

Inside a workflow file:

```yaml
# .github/workflows/changelog.yml
name: Changelog

on:
  pull_request:
  workflow_call:
    outputs:
      release-type:
        description: The release type extracted from changelog
        value: ${{ jobs.validate-changelog.outputs.release-type }}

jobs:
  validate_changelog:
    runs-on: [ ubuntu-latest ]
    outputs:
      release-type: ${{ steps.validate-changelog.outputs.release-type }}
    steps:
      - uses: actions/checkout@v4

      - name: Validate changelog
        id: validate-changelog
        uses: OpenTermsArchive/manage-changelog/validate@v0.4.0
```

#### Inputs

| Name                   | Description                                                                                                                              | Default value            |
|------------------------|------------------------------------------------------------------------------------------------------------------------------------------|--------------------------|
| `path`                 | Path to the changelog file                                                                                                               | `./CHANGELOG.md`         |
| `funders`              | A boolean or Regex string to identify funders in the Unreleased section. Set to `true` for default validation, `false` to disable, or provide a custom JavaScript Regex | `false` |
| `no-release-signature` | A boolean or Regex string to identify the no-release signature in the Unreleased section. Set to `true` for default validation, `false` to disable, or provide a custom JavaScript Regex | `true` |

#### Outputs

| Name            | Description                              |
|-----------------|------------------------------------------|
| `release-type`  | The release type extracted from the changelog. Possible values `major`, `minor`, `patch` or `no-release` |
| `next-version`  | Upcoming version computed as a SemVer identifier (e.g. `0.2.0`, `1.0.0`…) |

### `OpenTermsArchive/manage-changelog/release`

This action calculates the next version number and moves the `Unreleased` section of the changelog as the latest version, or erases its contents if no release is intended. It also exposes the calculated version and the content of that release.

#### Example

Inside a workflow file:

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [ main ]

jobs:
  changelog:
    uses: "./.github/workflows/changelog.yml"
  release:
    if: github.event.pull_request.merged == true && needs.changelog.outputs.release-type != 'no-release'
    needs: [ changelog ]
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Update changelog for release
        id: release-changelog
        uses: OpenTermsArchive/manage-changelog/release@v0.4.0

      - name: Update repository
        run: |
          git config user.name "Open Terms Archive Release Bot"
          git config user.email "release-bot@opentermsarchive.org"
          git add "CHANGELOG.md"
          git commit -m "Update changelog"
          git tag v${{ steps.release-changelog.outputs.version }}
          git push origin 
          git push --tags

      - name: Create GitHub release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ steps.release-changelog.outputs.version }}
          body: ${{ steps.release-changelog.outputs.content }}
          token: ${{ secrets.GITHUB_TOKEN }}

  clean-changelog:
    if: github.event.pull_request.merged == true && needs.changelog.outputs.release-type == 'no-release'
    needs: [ changelog ]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Update changelog for release
        uses: OpenTermsArchive/manage-changelog/release@v0.4.0

      - name: Save changelog
        run: |
          git config user.name "Open Terms Archive Release Bot"
          git config user.email "release-bot@opentermsarchive.org"
          git commit -m "Clean changelog" CHANGELOG.md
          git push origin
```

#### Inputs

| Name   | Description                     | Default value            |
|--------|---------------------------------|--------------------------|
| `path`   | Path to the changelog file    | `./CHANGELOG.md`         |
| `notice` | Custom notice for the release | `Full changeset and discussions: [#<pull_request_number>](<link_to_pull_request>)` |

#### Outputs

| Name      | Description                               |
|-----------|-------------------------------------------|
| `version` | The version number extracted from the changelog as a SemVer identifier (e.g. `0.2.0`, `1.0.0`…) |
| `content` | The content of the release extracted from the changelog |

## Enforced format

The base format that this action enforces is [Common Changelog](https://common-changelog.org), with some additions. The expected format is detailed below.

### `Unreleased` section

Common Changelog supports no “Unreleased” section, because “[this is an unproductive workflow](https://common-changelog.org/#62-how-is-this-different-from-keep-a-changelog)”. The rationale is accurate, and this action aligns with it. However, this action brings back this section, with a new way to use it: it is always temporary, used only for drafting within a branch. When the branch is merged, the `release` action will move that section or erase it, depending on if a release was requested or not. Thus, the `Unreleased` section is _always present_ as a drafting mechanism in branches, but is _never present_ in the exposed changelog to reusers. Hence, Common Changelog is enforced at the final changelog level, even though it is not in the temporary artifacts that branch changelogs are.

### SemVer tag

For changes that impact users and that should trigger a release, the `Unreleased` section must include a tag specifying the release type using one of the SemVer keywords: `[patch]`, `[minor]`, or `[major]`.

For example: `## Unreleased [minor]`.

This tag will be used to calculate the next version, based on the latest version present in the changelog and the next bump to apply.

### No release

Non-functional changes that do not impact users should not trigger a release, and should not be listed in the changelog. For example, an update to the README, the CONTRIBUTING file, or to the CI workflows, do not change the API and thus do not warrant a new release. In order to ensure continued validation, this cannot be detected from the lack of entry in the changelog. This action thus requires the following content to be added to the changelog, ensuring that contributors are fully aware of the choice they make if they request that no release is made:

```markdown
## Unreleased [no-release]

_Modifications made in this changeset do not add, remove or alter any behavior, dependency, API or functionality of the software. They only change non-functional parts of the repository, such as the README file or CI workflows._
```

### Pull request link in notice

Since each release is produced automatically from a single pull request, the [notice](https://common-changelog.org/#23-notice) links to the source pull request rather than [references](https://common-changelog.org/#242-references), which would always reference the same pull request. References can link to relevant parts of an RFC, decision record, or diff.

This notice is generated automatically by the `release` action and should not be added manually.

Example:

```markdown
_Full changeset and discussions: [#2](https://github.com/OpenTermsArchive/changelog-action/pull/2)._
```

### Funders acknowledgement

For codebases that receive funding and want to acknowledge it, doing so at release level is relevant. This practice enables tracking funding impact precisely, gives funders visibility across the reusers ecosystem as changelog contents are consumed and exposed through many tools (Dependabot, package managers…), and makes it clear to the community that evolutions are made possible through funding, thus encouraging contribution.

This action can enforce financial contributions acknowledgement in the changelog itself. Sponsor information is in quote format, starts with “Development of this release was supported by `<funding_from>`”, and provides the name and link to the sponsor, as well as information on the specific funding instrument, as specified by the sponsor itself or as required by law. A short message from the sponsor might also be added, as long as it abides by the community’s Code of Conduct and aligns with the project’s goals. For volunteer contributions, the sentence should start with: “Development of this release was made on a volunteer basis by `<contributor_name>`”. The format of the notice thus diverges from the Common Changelog specification in that it is not “a single-sentence paragraph”.

Example:

```markdown
> Development of this release was [supported](https://nlnet.nl/project/TOSDR-OTA/) by the [NGI0 Entrust Fund](https://nlnet.nl/entrust), a fund established by [NLnet](https://nlnet.nl/) with financial support from the European Commission's [Next Generation Internet](https://www.ngi.eu) programme, under the aegis of DG CNECT under grant agreement N°101069594.
```

## License

The code for this software is distributed under the [European Union Public Licence (EUPL) v1.2](https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12). In short, this [means](https://choosealicense.com/licenses/eupl-1.2/) you are allowed to read, use, modify and redistribute this source code, as long as you as you credit “Open Terms Archive Contributors” and make available any change you make to it under similar conditions.

Contact the core team over email at `contact@[project name without spaces].org` if you have any specific need or question regarding licensing.
