import axios from "axios";
import inquirer from "inquirer";
import * as EmailValidator from "email-validator";
import { getRemoteHostAsync, getUser } from "./filestructure";
import { createSocket, waitForEvent } from "./socket";

export const promptEmail = async () => {
  const { email: untrimmedEmail } = await inquirer.prompt({
    name: "email",
    type: "input",
    message: "Enter your email to login or sign up:",
    validate: (input) => EmailValidator.validate(input.trim()),
  });

  const email = untrimmedEmail.trim();

  if (!await login(email)) {
    return;
  }
  const socket = createSocket('cli');
  console.log("Please finish authentication by opening the email sent to " + email)
  console.log("Leave this terminal prompt running...");
  await waitForEvent(socket, "login");
  const user = await getUser();
  console.log("Signed in to floro as: " + user.username);
  process.exit();
};

export const login = async (email: string) => {
  try {
    const host = await getRemoteHostAsync();
    const response = await axios.post(host + "/api/authenticate", {
      email,
    });

    if (response?.data?.message != "ok") {
      console.error(
        "Something went wrong. Please check that your email is correct and try again."
      );
      return false;
    }

    return true;
  } catch (e) {
    console.error(
      "Something went wrong. Please check your internet connection and try again."
    );
    return false;
  }
};
