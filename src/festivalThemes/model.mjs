export const FESTIVAL_THEMES = [
  { id: 'festival-new-year', label: 'New Year', thai: 'เทศกาลปีใหม่', color: '#d8aa53', dark: true,
    description: 'พลุเหนือสายน้ำ · น้ำเงินยามค่ำ · แชมเปญโกลด์', motifs: ['firework', 'clock', 'confetti', 'star', 'horn'] },
  { id: 'festival-valentine', label: 'Valentine’s Day', thai: 'เทศกาลแห่งความรัก', color: '#c71347',
    description: 'โมเมนต์ของคู่รัก · แดงสตรอว์เบอร์รี · ชมพูหวาน', motifs: ['heart', 'linked-hearts', 'letter', 'rose', 'gift'] },
  { id: 'festival-songkran', label: 'Songkran', thai: 'สงกรานต์', color: '#0086a4',
    description: 'เล่นน้ำบนถนนกรุงเทพฯ · เทอร์ควอยซ์ · กระจกใส', motifs: ['water-gun', 'splash-person', 'bucket', 'droplets', 'ripple'] },
  { id: 'festival-halloween', label: 'Halloween', thai: 'เทศกาลฮาโลวีน', color: '#cd520e',
    description: 'ฟักทองและแสงเทียน · ทองแดง · การ์ดสีครีมสว่าง', motifs: ['pumpkin', 'bat', 'candle', 'witch-hat', 'ghost'] },
  { id: 'festival-loy-krathong', label: 'Loy Krathong', thai: 'ลอยกระทง', color: '#a47422',
    description: 'กระทงและแสงสะท้อนน้ำ · ฟ้ามุก · ขอบทอง', motifs: ['krathong', 'lotus', 'candle', 'ripple', 'moon'] },
  { id: 'festival-christmas', label: 'Christmas', thai: 'เทศกาลคริสต์มาส', color: '#13513b',
    description: 'ซานต้ามอบของขวัญ · รถเลื่อนและกวาง · เขียวป่าและครีม', motifs: ['gift', 'santa-hat', 'sleigh', 'reindeer', 'wreath'] },
].map(theme => ({ ...theme, image: `/festivals/${theme.id}.webp` }));

export const festivalThemeFor = id => FESTIVAL_THEMES.find(theme => theme.id === id) || null;
