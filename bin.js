#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Semver = require('semver/classes/semver');
const url = require('url');
const { parser, Changelog, Release } = require('./src');
const argv = require('yargs-parser')(process.argv.slice(2), {
    default: {
        file: 'CHANGELOG.md',
        url: null,
        https: true,
        quiet: false,
    },
    boolean: ['https', 'init', 'latest-release', 'release', 'quiet'],
});

const file = path.join(process.cwd(), argv.file);

try {
    if (argv.init) {
        const changelog = new Changelog('Changelog').addRelease(
            new Release('0.1.0', new Date(), 'First version')
        );

        save(file, changelog, true);
        process.exit(0);
    }

    const changelog = parser(fs.readFileSync(file, 'UTF-8'));

    if (argv.latestRelease) {
        const release = changelog.releases.find((release) => release.date && release.version);

        if (release) {
            console.log(release.version.toString());
        }

        process.exit(0);
    }

    if (argv.release) {
        const release = changelog.releases.find((release) => {
            return !release.date;
        });

        if (release) {
            let countChanges = 0;
            if(release.changes.forEach((changeTypeItems) => {
                countChanges += changeTypeItems.length;
            }));
            if(countChanges === 0) {
                console.error(red('No unreleased changes found'));
                process.exit(1);
            }
            if (!release.version) {
                const latestRelease = changelog.releases.find((release) => release.date && release.version);
                if(release.changes.get('changed').length > 0 || release.changes.get('removed').length > 0) {
                    release.version = new Semver(`${latestRelease.version.major + 1}.0.0`);
                } else if (release.changes.get('added').length > 0) {
                    release.version = new Semver(`${latestRelease.version.major}.${latestRelease.version.minor + 1}.0`);
                } else {
                    release.version = new Semver(`${latestRelease.version.major}.${latestRelease.version.minor}.${latestRelease.version.patch + 1}`);
                }
            }
            release.date = new Date();
            changelog.releases.unshift(new Release(undefined, undefined));
        } else {
            console.error(red('Unreleased section not found'));
            process.exit(1);
        }
    }

    if (!changelog.url && !argv.url) {
        const gitconfig = require('gitconfiglocal');

        gitconfig(process.cwd(), (err, config) => {
            if (err) {
                console.error(red(err));
                return;
            }

            changelog.url = getHttpUrl(
                config.remote && config.remote.origin && config.remote.origin.url
            );
            save(file, changelog);
        });
    } else {
        changelog.url = getHttpUrl(argv.url || changelog.url);
        save(file, changelog);
    }
} catch (err) {
    console.error(red(err.message));
    if (!argv.quiet) {
        process.exit(1);
    }
}

function getHttpUrl(remoteUrl) {
    if (!remoteUrl) {
        return;
    }

    const parsed = url.parse(remoteUrl.replace('git@', `https://`));

    if (!argv.https) {
        parsed.protocol = 'http';
    }

    parsed.pathname = parsed.pathname.replace(/\.git$/, '').replace(/^\/\:/, '/');

    return url.format(parsed);
}

function save(file, changelog, isNew) {
    const url = changelog.url;

    if (url && url.includes('gitlab.com')) {
        changelog.head = 'master';
    }

    fs.writeFileSync(file, changelog.toString());

    if (isNew) {
        console.log(green('Generated new file'), file);
    } else {
        console.log(green('Updated file'), file);
    }
}

function red(message) {
    return '\u001b[' + 31 + 'm' + message + '\u001b[' + 39 + 'm';
}

function green(message) {
    return '\u001b[' + 32 + 'm' + message + '\u001b[' + 39 + 'm';
}
