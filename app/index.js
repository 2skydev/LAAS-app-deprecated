const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { configStore, itemStore, logStore } = require("./store");
const { search, initBrowser } = require("./notification");
const { changeStatus } = require("./util");

let timeoutHandle = null;
let intervalHandle = null;
let sec = 0;
let isSearcing = false;
global.win = null;
global.page = null;

const createWindow = () => {
  global.win = new BrowserWindow({
    width: 1800,
    height: 1000,
    backgroundColor: "#36393F",
    darkTheme: true,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      nativeWindowOpen: false,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (process.env.NODE_ENV === "dev") {
    global.win.loadURL("http://localhost:3000");
    global.win.webContents.openDevTools();
  } else {
    global.win.loadFile(`${path.join(__dirname, "../www/index.html")}`);
  }

  global.win.on("ready-to-show", () => {
    global.win.show();
  });
};

const searchInterval = async () => {
  if (isSearcing) {
    return;
  }

  clearTimeout(timeoutHandle);
  clearInterval(intervalHandle);

  const setting = configStore.get("notification");

  if (!page || !setting.discordUserID) {
    changeStatus("error", "configError", "필수 설정값이 비어있습니다");
    return;
  }

  isSearcing = true;

  changeStatus("processing", "searchStart", "매물 검색 시작");

  await search();

  sec = setting.interval * 60;
  changeStatus("success", "nextSearchSec", `다음 검색까지 ${sec}초`);

  intervalHandle = setInterval(() => {
    sec--;
    changeStatus("success", "nextSearchSec", `다음 검색까지 ${sec}초`);
  }, 1000);

  timeoutHandle = setTimeout(searchInterval, 1000 * 60 * setting.interval);

  isSearcing = false;
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 모든 창이 닫길 때 앱 끄기
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 창 닫기, 최대화, 최소화 같은 컨트롤 기능
ipcMain.on("appControl", async (e, action) => {
  switch (action) {
    case "minimize": {
      win.minimize();
      break;
    }

    case "maximize": {
      win.isMaximized() ? win.unmaximize() : win.maximize();
      break;
    }

    case "close": {
      win.close();
      break;
    }
  }
});

// 검색 바로 시작 요청시 처리
ipcMain.on("requestNowSearch", () => {
  searchInterval();
});

// 크롤링 브라우저 생성
ipcMain.handle("initBrowser", async () => {
  if (global.page) {
    console.log("existBrowser");
    return "existBrowser";
  }

  const setting = configStore.get("notification");

  global.page = await initBrowser(setting);

  if (!global.page) {
    changeStatus("error", "loginFail", "로스트아크 로그인 실패");
    console.log("loginFail");
    return "loginFail";
  }

  searchInterval();

  console.log("initBrowser ok");
  return "ok";
});

// 로그 데이터가 변경되었을 때 변경되었다는 이벤트 생성
logStore.onDidChange("notification", (logs) => {
  if (global.win) global.win.webContents.send("logs", logs);
});

// 설정이 변경되었을 때 필수 값들을 확인 후 매물 검색 실행
configStore.onDidChange("notification", () => {
  searchInterval();
});

ipcMain.handle("getConfig", (e, key) => {
  return configStore.get(key);
});

ipcMain.handle("setConfig", (e, key, data) => {
  return configStore.set(key, data);
});

ipcMain.handle("getItems", (e) => {
  return itemStore.get("notification");
});

ipcMain.handle("setItems", (e, data) => {
  return itemStore.set("notification", data);
});

ipcMain.handle("getLogs", () => {
  return logStore.get("notification");
});

const setting = configStore.get("notification");

if (!setting.saveLogs) {
  logStore.clear();
}
