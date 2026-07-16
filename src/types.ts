// sync が history:latest として公開する1レコード（氏名なし・電話はハッシュ）
export interface HistoryRecord {
  date: string;      // 参加日 JST 'YYYY-MM-DD'
  course: string;    // コース名
  pax: number;       // 人数
  amount: number;    // 合計金額（円）
  status: string;    // ステータス（履歴は基本 '参加済'）
  phoneHash: string; // 電話番号のソルト付きハッシュ（復元不可）
  source?: string;   // 流入経路カテゴリ（自己申告を正規化。旧データには無い）
}
