import { checkQzTrayInstalled } from "../api/qzTrayApi";

export const logQzTrayStatus = async () => {
  const status = await checkQzTrayInstalled();
  console.log(status);
  return status;
};
