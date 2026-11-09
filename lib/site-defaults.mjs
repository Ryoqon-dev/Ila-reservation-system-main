export const IMAGE_SLOTS=['logo','wordmark','campus'];
export const IMAGE_LIMITS={logo:196608,wordmark:196608,campus:786432};
export const DEFAULT_IMAGES={logo:'/assets/logo.png',wordmark:'/assets/wordmark.png',campus:'/assets/campus.jpg'};
export const DEFAULT_SITE={
 institution:'선문대학교',term:'36',organization:'총동아리연합회',department:'지원부',brand:'일아',brandMark:'日芽',
 englishLabel:'SUN MOON UNIVERSITY · 36TH CLUB UNION',slogan:'일렁이는 열정으로 아름답게 피어나라.',
 heroTitle:'함께하는 동아리,\n더 편리한 일상.',heroDescription:'장소대여부터 동아리 관리까지.\n일아가 동아리의 활동을 함께합니다.',
 footerMessage:'동아리의 오늘을 잇고, 더 나은 내일을 만듭니다.',contactUrl:'https://open.kakao.com/o/sYXht1Di',
 homeNoticeEnabled:false,homeNoticeTitle:'총동아리연합회 공지',homeNoticeBody:'',
 equipmentNoticeTitle:'장비대여 이용 안내',equipmentNoticeBody:'장비별 구성과 주의사항을 확인해주세요. 대여 신청과 수령·반납은 지원부 안내에 따라 진행해주세요.',
 boardNoticeTitle:'보드게임 대여 이용 안내',boardNoticeBody:'게임별 구성품과 이용 안내를 확인해주세요. 대여·반납 시 구성품 누락과 파손 여부를 함께 확인해주세요.',
 noticeTitle:'예약 전, 꼭 확인해주세요',noticeEnabled:true,
 notices:[
  {id:'entry-photo',title:'입실·퇴실 사진',body:'입실 직후 1장, 퇴실 직후 1장, 총 2장을 지원부 오픈채팅에 보내주세요. 미제출일당 -10점이 적용됩니다.',enabled:true},
  {id:'hours',title:'이용 시간',body:'09:00~15:00는 1시간 단위로 최대 4시간, 이후에는 A·B·C타임으로 운영합니다. 모든 사용은 21:00까지입니다.',enabled:true},
  {id:'limits',title:'금요일·주말·공휴일',body:'동아리별 하루 총 4시간까지 예약할 수 있습니다. 뒷타임이 없을 때 지원부 추가승인 후 연장할 수 있습니다.',enabled:true},
  {id:'inspection',title:'동방점검과 음식물',body:'동방점검일에도 대여할 수 있지만 점검 참석은 필수입니다. 장소 내 음식물 섭취는 금지되며, 위반 시 동아리 활동이 정지될 수 있습니다.',enabled:true},
  {id:'password',title:'비밀번호 문의',body:'목·금·주말에 지원부가 부재중이면 지원부 오픈채팅으로 장소 비밀번호를 문의해주세요.',enabled:true}
 ]
};
export const initialSiteContent=()=>({version:'initial',settings:structuredClone(DEFAULT_SITE),images:{...DEFAULT_IMAGES},noticeVersion:'v8',updatedAt:null});
export const unionLabel=site=>`${site.term}대 ${site.organization}`;
