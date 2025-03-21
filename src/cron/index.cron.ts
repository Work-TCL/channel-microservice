import cron from "node-cron";
import { getMidnightYTData } from "../controller/creator/youtube/youtube.controller";
import { getMidnightInstagramData, refreshInstagramToken } from "../controller/creator/instagram/auth.controller";

//Run at 1 Am every day
cron.schedule("0 1 * * *", async() => {
    await getMidnightYTData();
}, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Indian Standard Time (IST)
});

//Run at 2 Am every day
cron.schedule("0 2 * * *", async () => {
    console.log("Running instagram video data fetch 2 AM IST...");
    await getMidnightInstagramData()
}, {
    scheduled: true,
    timezone: "Asia/Kolkata"
});

//Run at 3 Am every day
cron.schedule("0 3 * * *", () => {
    console.log("🔄 Running Instagram Token Refresh Cron...");
    refreshInstagramToken();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  

// cron.schedule("* * * * *", async () => {
//     console.log("Running task every minute...");
// }, {
//     scheduled: true,
//     timezone: "Asia/Kolkata"
// });

export default cron;