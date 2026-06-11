import { Amplify } from "aws-amplify";
import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  signIn,
  signOut,
  signUp,
} from "aws-amplify/auth";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!,
    },
  },
});

export async function idToken(): Promise<string | undefined> {
  try {
    const session = await fetchAuthSession();
    return session?.tokens?.idToken?.toString();
  } catch (error) {
    console.error(error);
  }
}

/** Translate Cognito's exception names into the study partner's voice. */
export function authErrorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "name" in e) {
    switch ((e as { name: string }).name) {
      case "UserNotFoundException":
      case "NotAuthorizedException":
        return "That email and password don't match our records.";
      case "UserNotConfirmedException":
        return "This account hasn't been confirmed yet — check your email for the code.";
      case "UsernameExistsException":
        return "You already have an account with that email — sign in instead.";
      case "InvalidPasswordException":
        return "Passwords need at least 10 characters.";
      case "InvalidParameterException":
        return "That doesn't look quite right — check the email and password.";
      case "LimitExceededException":
      case "TooManyRequestsException":
        return "Too many attempts — wait a minute, then try again.";
      case "CodeMismatchException":
        return "That code doesn't match — double-check the email.";
      case "ExpiredCodeException":
        return "That code has expired — use “resend code” to get a fresh one.";
      case "NetworkError":
        return "Can't reach the sign-in desk — check your connection and try again.";
    }
  }
  return e instanceof Error ? e.message : fallback;
}

export { confirmSignUp, getCurrentUser, resendSignUpCode, signIn, signUp, signOut };
