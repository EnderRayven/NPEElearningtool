import packageJson from '../package.json'

export const appVersion = packageJson.version
export const githubRepositoryUrl = packageJson.repository.url.replace(/\.git$/, '')
