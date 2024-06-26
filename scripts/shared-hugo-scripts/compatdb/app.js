
const fs = require("fs-extra");
const path = require("path");
const logger = require("fancy-log");
const fetch = require("node-fetch");
const tomlify = require("@iarna/toml");
const execa = import("execa");


const fsPathCode = `./suyu-games-wiki/games`;
const fsPathHugo = "../../../site";
const fsPathHugoContent = `${fsPathHugo}/content/game`;
const fsPathHugoBoxart = `${fsPathHugo}/static/images/game/boxart`;
const fsPathHugoIcon = `${fsPathHugo}/static/images/game/icons`;
const fsPathHugoScreenshots = `${fsPathHugo}/static/images/screenshots`;
const fsPathHugoSavefiles = `${fsPathHugo}/static/savefiles/`;

process.on("unhandledRejection", (err) => {
  logger.error("Unhandled rejection on process.");
  logger.error(err);
  process.exit(1);
});

/**
 * @param {fs.PathLike} directory
 * @param {string} repository
 */
async function gitPull(directory, repository) {
  const exec = (await execa).execaSync;
  if (fs.existsSync(directory)) {
    logger.info(`Fetching latest from Github : ${directory}`);
    logger.info(`git -C ${directory} pull`);
    exec("git", ["-C", directory, "pull"]);
  } else {
    logger.info(`Cloning repository from Github : ${directory}`);
    logger.info(`git clone ${repository}`);
    exec("git", ["clone", repository]);
  }
}

async function run() {
  // Make sure the output directories in Hugo exist.
  [
    fsPathHugoContent,
    fsPathHugoBoxart,
    fsPathHugoIcon,
    fsPathHugoSavefiles,
    fsPathHugoScreenshots,
  ].forEach(function (path) {
    if (fs.existsSync(path) == false) {
      logger.info(`Creating Hugo output directory: ${path}`);
      fs.ensureDirSync(path);
    }
  });

  // Fetch game files stored in games-wiki repository.
  gitPull(
    `./suyu-games-wiki`,
    `https://github.com/suyu-wiki/suyu-games-wiki.git`
  );

  // Loop through each game and process it.
  let games = await fetch(
    `https://raw.githubusercontent.com/yuzu-mirror/api/main/gamedb/websiteFeed`
  ).then((resp) => resp.json());
  await Promise.all(
    games.map(async (x) => {
      try {
        logger.info(`Processing game: ${x.id}`);

        // Set metadata.
        x.date = `${new Date().toISOString()}`;

        // Hugo requires compatibility to be a string to link to data JSON.
        x.compatibility = x.compatibility.toString();
        x.testcases.forEach(
          (x) => (x.compatibility = x.compatibility.toString())
        );

        x.issues = x.issues || [];

        // Copy the boxart for the game.
        if (fs.existsSync(`${fsPathCode}/${x.id}/boxart.png`)) {
          fs.copySync(
            `${fsPathCode}/${x.id}/boxart.png`,
            `${fsPathHugoBoxart}/${x.id}.png`
          );
        } else if (fs.existsSync(`${fsPathCode}/${x.id}/icon.png`)) {
          fs.copySync(
            `${fsPathCode}/${x.id}/icon.png`,
            `${fsPathHugoBoxart}/${x.id}.png`
          );
        }

        // Copy the icon for the game.
        // If the icon does not exist, use the boxart in place of the icon.
        if (fs.existsSync(`${fsPathCode}/${x.id}/icon.png`)) {
          fs.copySync(
            `${fsPathCode}/${x.id}/icon.png`,
            `${fsPathHugoIcon}/${x.id}.png`
          );
        } else if (fs.existsSync(`${fsPathCode}/${x.id}/boxart.png`)) {
          fs.copySync(
            `${fsPathCode}/${x.id}/boxart.png`,
            `${fsPathHugoIcon}/${x.id}.png`
          );
        }

        // SAVEFILE BLOCK
        var fsPathCodeSavefilesGame = `${fsPathCode}/${x.id}/savefiles/`;
        var fsPathHugoSavefilesGame = `${fsPathHugoSavefiles}/${x.id}/`;
        if (fs.existsSync(fsPathCodeSavefilesGame)) {
          // Create the savefile directory for the game.
          if (fs.existsSync(fsPathHugoSavefilesGame) == false) {
            fs.mkdirSync(fsPathHugoSavefilesGame);
          }

          // Copy all savefiles into the output folder, and read their data.
          fs.readdirSync(fsPathCodeSavefilesGame).forEach((file) => {
            if (path.extname(file) == ".zip") {
              fs.copySync(
                `${fsPathCodeSavefilesGame}/${file}`,
                `${fsPathHugoSavefilesGame}/${file}`
              );
            }
          });
          // Finished copying all savefiles into the output folder, and reading their data.
        }
        // END SAVEFILE BLOCK

        // Copy the screenshots for the game.
        let fsPathScreenshotInputGame = `${fsPathCode}/${x.id}/screenshots/`;
        let fsPathScreenshotOutputGame = `${fsPathHugoScreenshots}/${x.id}/`;
        if (fs.existsSync(fsPathScreenshotInputGame)) {
          // Create the savefile directory for each game.
          if (fs.existsSync(fsPathScreenshotOutputGame) == false) {
            fs.mkdirSync(fsPathScreenshotOutputGame);
          }

          // Copy all screenshots into the output folder.
          fs.readdirSync(fsPathScreenshotInputGame).forEach((file) => {
            if (path.extname(file) == ".png") {
              fs.copySync(
                `${fsPathScreenshotInputGame}/${file}`,
                `${fsPathScreenshotOutputGame}/${file}`
              );
            }
          });
        }

        // Clear out the wiki markdown so it won't be stored with the metadata.
        let wikiText = x.wiki_markdown || "";
        x.wiki_markdown = null;

        let meta = tomlify.stringify(x);
        let contentOutput = `+++\r\nleft_sidebar = true\r\n${meta}\r\n+++\r\n\r\n${wikiText}\r\n`;

        await fs.writeFile(`${fsPathHugoContent}/${x.id}.md`, contentOutput);

        return x;
      } catch (ex) {
        logger.warn(`${x.id} ${x.title} failed to generate: ${ex}`);
        logger.error(ex);
        throw ex;
      }
    })
  );
}

// Script start
run();
