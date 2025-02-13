import logSymbols from 'log-symbols';
import { PACKAGE_EMAILS_PATH, PACKAGE_PUBLIC_PATH } from './constants';
import fs from 'fs';
import ora from 'ora';
import shell from 'shelljs';
import path from 'path';
import fse from 'fs-extra';
import glob from 'glob';
import { closeOraOnSIGNIT } from './close-ora-on-sigint';

export const generateEmailsPreview = async (
  emailDir: string,
  type: 'all' | 'static' | 'templates' = 'all',
) => {
  try {
    const spinner = ora('Generating emails preview').start();
    closeOraOnSIGNIT(spinner)

    if (type === 'all' || type === 'templates') {
      await createEmailPreviews(emailDir);
    }
    if (type === 'all' || type === 'static') {
      await createStaticFiles(emailDir);
    }

    spinner.stopAndPersist({
      symbol: logSymbols.success,
      text: 'Emails preview generated',
    });
  } catch (error) {
    console.log({ error });
  }
};

const createEmailPreviews = async (emailDir: string) => {
  const hasEmailsDirectory = fs.existsSync(PACKAGE_EMAILS_PATH);

  if (hasEmailsDirectory) {
    await fs.promises.rm(PACKAGE_EMAILS_PATH, { recursive: true });
  }

  const list = glob.sync(path.join(emailDir, '/*.{jsx,tsx}'), {
    absolute: true,
  });

  /**
   * instead of copying all files, which would break and js/ts imports,
   * we create placeholder files which just contain the following code:
   *
   * import Mail from '../../path/to/emails/my-template.tsx`
   * export default Mail
   */
  for (const absoluteSrcFilePath of list) {
    const fileName = absoluteSrcFilePath.split('/').pop()!;
    const targetFile = path.join(
      PACKAGE_EMAILS_PATH,
      absoluteSrcFilePath.replace(emailDir, ''),
    );
    const importPath = path.relative(
      path.dirname(targetFile),
      path.dirname(absoluteSrcFilePath),
    );

    const importFile = path.join(importPath, fileName);

    // if this import is changed, you also need to update `client/src/app/preview/[slug]/page.tsx`
    const sourceCode =
      `import Mail from '${importFile}';export default Mail;`.replace(
        ';',
        ';\n',
      );
    await fse.ensureDir(path.dirname(targetFile));
    if (fse.existsSync(targetFile)) {
      if (fse.readFileSync(targetFile, 'utf8') === sourceCode) {
        // file already exists, no need to trigger a rebuild.
        // can otherwise trigger the next.js rebuild multiple times
        continue;
      }
    }
    await fse.writeFile(targetFile, sourceCode);
  }
};

const createStaticFiles = async (emailDir: string) => {
  const hasPublicDirectory = fs.existsSync(PACKAGE_PUBLIC_PATH);

  if (hasPublicDirectory) {
    await fs.promises.rm(PACKAGE_PUBLIC_PATH, { recursive: true });
  }

  await fse.ensureDir(path.join(PACKAGE_PUBLIC_PATH, 'static'));

  const result = shell.cp(
    '-r',
    path.join(emailDir, 'static'),
    path.join(PACKAGE_PUBLIC_PATH),
  );
  if (result.code > 0) {
    throw new Error(
      `Something went wrong while copying the file to ${path.join(
        emailDir,
        'static',
      )}, ${result.cat()}`,
    );
  }
};
