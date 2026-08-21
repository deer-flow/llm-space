import { commands } from "./commands";
import { common } from "./common";
import { desktop } from "./desktop";
import { errors } from "./errors";
import { menu } from "./menu";
import { playground } from "./playground";
import { reminders } from "./reminders";
import { settings } from "./settings";

/** The canonical English tree — the schema every locale must mirror. */
export const en = {
  common,
  settings,
  commands,
  menu,
  reminders,
  errors,
  playground,
  desktop,
};
