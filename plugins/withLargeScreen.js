const { withAndroidManifest, withInfoPlist } = require("@expo/config-plugins");

const EXTRA_CONFIG_CHANGES = [
  "smallestScreenSize",
  "density",
  "layoutDirection",
];

const IPAD_ORIENTATIONS = [
  "UIInterfaceOrientationPortrait",
  "UIInterfaceOrientationPortraitUpsideDown",
  "UIInterfaceOrientationLandscapeLeft",
  "UIInterfaceOrientationLandscapeRight",
];

/** Adds config change flags without dropping the ones already there. */
function mergeConfigChanges(current) {
  const parts = (current || "").split("|").filter(Boolean);
  for (const flag of EXTRA_CONFIG_CHANGES) {
    if (!parts.includes(flag)) parts.push(flag);
  }
  return parts.join("|");
}

/**
 * Tablets, foldables and resizable windows. The activity handles window
 * changes itself so folding or resizing never restarts a session. iPad windows
 * can be resized (Stage Manager) and use every orientation.
 */
const withLargeScreen = (config) => {
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    const activity = app?.activity?.find(
      (a) => a.$["android:name"] === ".MainActivity",
    );
    if (app) app.$["android:resizeableActivity"] = "true";
    if (activity) {
      activity.$["android:configChanges"] = mergeConfigChanges(
        activity.$["android:configChanges"],
      );
      activity.$["android:resizeableActivity"] = "true";
    }
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults.UIRequiresFullScreen = false;
    config.modResults["UISupportedInterfaceOrientations~ipad"] =
      IPAD_ORIENTATIONS;
    return config;
  });

  return config;
};

module.exports = withLargeScreen;
module.exports.mergeConfigChanges = mergeConfigChanges;
