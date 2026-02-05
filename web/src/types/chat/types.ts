export interface SignalPayload {
    offer?: RTCSessionDescriptionInit;
    answer?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidate;
}

//接收Signal
export interface SignalData {
    sender: string,
    senderName? :string,
    signal: SignalPayload,
}

export type ChatMessage = {
    id: string;
    kind: "text";
    fromID: string;     // userID
    fromName: string;   //userName
    text: string;     // msg.msg
    ts: number;       // msg.ts
} | { 
    id: string;
    kind: "file"; 
    fromID: string; 
    fromName: string; 
    fileName: string; 
    size: number; 
    mime: string; 
    url: string; 
    ts: number 
};

export type FileCtrl =
  | { type: "file-meta"; id: string; name: string; size: number; mime: string; ts: number }
  | { type: "file-end"; id: string; ts: number };

export type IncomingFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  chunks: ArrayBuffer[];
  received: number;
  ts: number;
};