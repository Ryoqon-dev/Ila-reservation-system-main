// Both the booking shortcut and manual form use the same once-per-club/day key.
// The check is part of the write so concurrent requests cannot double-charge.
export function photoPenaltyStatement(sql,{clubId,date,content,points,guard}){
 const id=crypto.randomUUID(),stamp=new Date().toISOString();
 return sql(`INSERT INTO penalties(id,club_id,date,content,points,kind,source_key,voided,created_at)
  SELECT ?,?,?,?,?, 'photo',?,0,?
  WHERE NOT EXISTS(SELECT 1 FROM penalties WHERE club_id=? AND date=? AND kind='photo' AND voided=0)
  AND ${guard.query}
  ON CONFLICT(source_key) DO UPDATE SET content=excluded.content,points=excluded.points,voided=0,created_at=excluded.created_at
  WHERE penalties.voided=1 AND NOT EXISTS(SELECT 1 FROM penalty_closures pc WHERE pc.penalty_id=penalties.id)
  RETURNING id`,id,clubId,date,content,points,'photo:'+clubId+':'+date,stamp,clubId,date,...guard.args);
}
