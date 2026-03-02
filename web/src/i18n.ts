import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';


const resources = {
  en: {
    translation: {
      "main_title_1": "Quickly and Securely",
      "main_title_2": "Transfer file",
      "create_room": "Create Room",
      "join_room": "Join Room",
      "features_title": "Features",
      
      // Feature 1
      "feature_1_1": "Files are transferred directly",
      "feature_1_2": "between devices using",
      "feature_1_3": ", with no server relay.",
      
      // Feature 2
      "feature_2_1": "Connect easily between",
      "feature_2_2": "phones, tablets, and computers",
      "feature_2_3": "—just scan the QRCode.",
      
      // Feature 3
      "feature_3_1": "No installation, no registration",
      "feature_3_2": "—open the webpage and start",
      "feature_3_3": "sharing immediately.",
      
      // Modal
      "placeholder_room_id": "please input room id",
      "placeholder_username": "please input username",
      "confirm_btn": "Confirm",

      //chatroom
      //members
      "members_title": "members",
      "memebrs_share": "Share",
      "members_exit": "Exit",
    }
  },
  zh: {
    translation: {
      "main_title_1": "快速且安全地",
      "main_title_2": "传输文件",
      "create_room": "创建房间",
      "join_room": "加入房间",
      "features_title": "功能特点",
      
      // Feature 1
      "feature_1_1": "文件直接在设备之间传输",
      "feature_1_2": "基于",
      "feature_1_3": "技术，无需服务器中继。",
      
      // Feature 2
      "feature_2_1": "跨设备轻松连接",
      "feature_2_2": "支持手机、平板和电脑",
      "feature_2_3": "只需扫描二维码。",
      
      // Feature 3
      "feature_3_1": "免安装，免注册",
      "feature_3_2": "打开网页",
      "feature_3_3": "即可立即开始分享。",
      
      // Modal
      "placeholder_room_id": "请输入房间号",
      "placeholder_username": "请输入用户名",
      "confirm_btn": "确认",

      //chatroom
      //members
      "members_title": "成员列表",
      "members_share": "分享房间",
      "members_exit": "退出",
    }
  }
};

i18n
  .use(initReactI18next) 
  .init({
    resources,
    lng: "en", 
    fallbackLng: "en",
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;