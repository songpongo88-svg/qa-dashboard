type UserAccount = {

  username: string;

  password: string;

  displayName: string;

  role: "QA" | "Supervisor" | "Senior" | "Admin" | "Agent";

  agentName?: string;

};

const AGENTS = [

  "Anucha Makundin",

  "Arisa aiemrit",

  "Chatkonnaphat Bhusomya",

  "Jariyawadee Taboodda",

  "Jureeporn Piddum",

  "Krivut Vongkampan",

  "Natcha Chai-in",

  "Nattapol Suprom",

  "Songpon Phothong",

  "Sunijtra Siritan",

  "Suphitcha Keawliam",

  "Wassana Phothong",

].sort((a, b) => a.localeCompare(b));

const USER_ACCOUNTS: UserAccount[] = [

  {

    username: "qa",

    password: "qa1234",

    displayName: "QA Admin",

    role: "QA",

  },

  {

    username: "supervisor",

    password: "super1234",

    displayName: "Supervisor",

    role: "Supervisor",

  },

  {

    username: "senior",

    password: "senior1234",

    displayName: "Senior",

    role: "Senior",

  },

  {

    username: "admin",

    password: "admin1234",

    displayName: "Admin",

    role: "Admin",

  },

  ...AGENTS.map((agent) => ({

    username: agent.toLowerCase().replace(/[^a-z]/g, ""),

    password: "agent1234",

    displayName: agent,

    role: "Agent" as const,

    agentName: agent,

  })),

];
 
