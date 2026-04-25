export type Language = "ru" | "rs" | "en";

export interface Translations {
  ru: Record<string, any>;
  rs: Record<string, any>;
  en: Record<string, any>;
}

export const translations: Translations = {
  ru: {
    nav: {
      home: "Главная",
      appearance: "Внешность",
      habits: "Привычки",
      skills: "Навыки",
      health: "Здоровье",
      conditions: "Условия",
      contact: "Контакты",
    },
    hero: {
      title: "Привет! Я собака Булка",
      intro: `Мне где-то 1-2 года, но это не точно. Ветеринар уверен, что я больше не буду расти, поэтому вы видите меня в расцвете сил.`,
      story: `Меня нашла девочка Лена из России, когда я попрошайничала в ресторане Александр Ски Стажа в Бановом брдо. Я чувствовала себя очень плохо из-за того, что на мне сидело больше 70 клещей, поэтому Лена решила забрать меня и помочь мне.`,
      current: `Сейчас Лена меня починила, отмыла, научила премудростям и готова отдать меня хорошим хозяевам на удочерение. Лена плакала, когда делала этот сайт, потому что она хочет меня оставить, но она вынуждена каждый год уезжать из Белграда на всю зиму из-за проблем с воздухом. А ей хочется, чтобы рядом со мной всегда были любящие люди.`,
      question: "Почитайте про меня, может, вы меня полюбите и захотите забрать?",
    },
    appearance: {
      title: "Внешность",
      description: `Я вешу 22 килограмма, а в холке 50 см высотой. У меня великолепные мягкие уши, как у корги, и хвостик крючком, как у лайки. А мордочка моя похожа на акиту-ину. В общем, моя бабушка явно тусовалась с какими-то благородными собаками.`,
    },
    habits: {
      title: "Бытовые привычки",
      bathroom: `Я поняла, что нужно ходить в туалет на улицу на второй день проживания дома, и с тех пор никогда не писала дома.`,
      walks: `Со мной гуляют два раза в день: в 10 утра и в 10 вечера. Я больше люблю сидеть дома, поэтому рада сделать свои дела и пойти домой, но могу и составить компанию для вас на целый день и сходить с вами в банк, в салон красоты, в ресторан и в гости. Там я спокойно лягу возле вас и буду валяться.`,
      behavior: `Я не буду прыгать на других собак или драться с ними - не на помойке же я себя нашла. Могу гулять спокойно и на поводке, и без него: буду ходить вокруг вас и нюхать цветочки.`,
      car: `Я умею сама запрыгивать в машину и спокойно ехать на заднем сиденье. У меня суперспособность - меня никогда не укачивает!`,
      home: `Дома я в основном сплю. Лена не разрешает мне залезать на диван, что я, конечно, считаю дискриминацией. Если вдруг меня оставят одну на целый день, я продолжу спать. Не понимаю собак, которые боятся оставаться дома одни - наоборот же, круто, можно побыть в тишине.`,
      food: `Я ем сухой корм два раза в день. И вкусняшки. Я люблю собачий паштет и сыр.`,
      cats: `Сейчас я живу с двумя котами. Если честно, я их не замечаю: ну ходят и ходят мимо, мне-то что.`,
    },
    skills: {
      title: "Навыки",
      intro: `Говорят, я умная собака, потому что за неделю выучила целых пять команд: "Сидеть", "Лежать", "Место", "Ко мне", "Дай лапу", "Мячик".`,
      explanation: `Не понимаю, чего тут сложного: просто делаешь, что тебя просят, а тебе потом дают вкусняшку.`,
    },
    health: {
      title: "Здоровье",
      intro: "На улице жилось тяжело.",
      bullet1: `Во-первых, в меня когда-то выстрелил из пневматического пистолета плохой человек. У меня возле позвоночника застряла пуля. Она не вредит моему здоровью, и ее не нужно удалять, если она не начнет болеть.`,
      bullet2: `Во-вторых, очень давно я сломала заднюю лапку. Никто меня не лечил, поэтому она срослась неправильно, и иногда после часовой ходьбы я начинаю хромать. Доктор говорит, ничего страшного, это придает мне шарма!`,
      bullet3: `В-третьих, у меня в сердце живёт сердечный червь. Он сейчас на второй стадии развития, и Лена уже начала его выгонять. Следующие полгода мы будем заходить к ветеринару раз в две недели, отдавать ему 4000 динаров и получать за это укол и капли. Так червь умрет. Из-за него мне нельзя бегать больше 5 минут, потому что я начинаю кашлять.`,
      bullet4: `В-четвёртых, меня нельзя стерилизовать, пока мы не прогоним червя. Но если честно, мячик мне нравится больше, чем настырные кобели.`,
    },
    conditions: {
      title: "Условия",
      adoption: `Лена говорит, отдаст меня и в квартиру, и в дом, но не разрешит никому держать меня на цепи.`,
      communication: `Ещё она говорит, что хотела бы общаться или вообще дружить с моими будущими хозяевами. И она гарантированно заберёт меня назад, если мы с вами вдруг не подружимся.`,
      support: `Она будет помогать с оплатой моего лечения и стерилизации. А ещё она или наша подруга Ира будут забирать меня на передержку, когда вы решите поехать в путешествие. И ещё она может возить меня на своей машине к ветеринару, чтобы вы не платили за такси.`,
      perk: `Прикиньте, я сразу пристраиваюсь с двумя нянями и личным водителем. Вот это да!`,
    },
    contact: {
      title: "Как познакомиться со мной?",
      location: `Мы с Леной живём на Вуковом споменике, возле Суперверо Зира. Можете прийти с нами погулять, попить чаю. А если хотите, мы сами приедем к вам познакомиться!`,
    },
  },
  rs: {
    nav: {
      home: "Početna",
      appearance: "Izgled",
      habits: "Navike",
      skills: "Veštine",
      health: "Zdravlje",
      conditions: "Uslovi",
      contact: "Kontakt",
    },
    hero: {
      title: "Zdravo! Ja sam Bulka, kuca.",
      intro: `Imam negde 1–2 godine, ali to nije sigurno. Veterinar je siguran da više neću rasti, tako da me vidite u punoj snazi.`,
      story: `Našla me je devojka Lena iz Rusije, kada sam prosila u restoranu Aleksandar Ski Staza na Banovom brdu. Osećala sam se jako loše jer je na meni bilo više od 70 krpelja, pa je Lena odlučila da me uzme i pomogne mi.`,
      current: `Sada me je Lena izlečila, naučila svakojakim mudrostima i spremna je da me da dobrim vlasnicima na usvajanje. Lena je plakala dok je pravila ovaj sajt, jer želi da me zadrži, ali mora svake godine da napušta Beograd na celu zimu zbog problema sa vazduhom. A želi da pored mene uvek budu ljudi koji me vole.`,
      question: "Pročitajte o meni — možda me zavolite i poželite da me uzmete?",
    },
    appearance: {
      title: "Izgled",
      description: `Težim 22 kilograma, a u grebenu sam 50 cm visoka. Imam prelepe mekane uši, kao korgi, i repić u obliku kuke, kao lajka. A njuškica mi liči na akita inua. Ukratko, moja baka se očigledno družila s nekim plemenitim psima.`,
    },
    habits: {
      title: "Kućne navike",
      bathroom: `Shvatila sam da se u toalet ide napolje već drugog dana boravka u kući i od tada nikada nisam piškila kod kuće.`,
      walks: `Šetaju me dva puta dnevno: u 10 ujutru i u 10 uveče. Više volim da budem kod kuće, pa mi je drago da obavim svoje i vratim se, ali mogu i da vam pravim društvo ceo dan i da idem s vama u banku, kozmetički salon, restoran i u goste. Tamo ću mirno leći pored vas i izvaljati se.`,
      behavior: `Neću skakati na druge pse niti se tući s njima — nisam se valjda na đubrištu našla. Mogu mirno da šetam i na povocu i bez njega: hodaću oko vas i njuškati cvetiće.`,
      car: `Umem sama da uskočim u auto i mirno se vozim na zadnjem sedištu. Imam supermoć — nikada mi ne pozli u vožnji!`,
      home: `Kod kuće uglavnom spavam. Lena mi ne dozvoljava da se penjem na kauč, što ja, naravno, smatram diskriminacijom. Ako me slučajno ostave samu ceo dan, nastaviću da spavam. Ne razumem pse koji se plaše da ostanu sami kod kuće — naprotiv, super je, može da se uživa u tišini.`,
      food: `Jedem suvu hranu dva puta dnevno. I poslastice. Volim pseći paštet i sir.`,
      cats: `Trenutno živim s dva mačka. Iskreno, ne primećujem ih: pa hodaju tuda, šta me briga.`,
    },
    skills: {
      title: "Veštine",
      intro: `Kažu da sam pametan pas, jer sam za nedelju dana naučila čak pet komandi: „Sedi", „Lezi", „Mesto", „Kod mene", „Daj šapu", „Lopta".`,
      explanation: `Ne razumem šta je tu teško: jednostavno radiš ono što te traže, a onda ti daju poslasticu.`,
    },
    health: {
      title: "Zdravlje",
      intro: "Na ulici je bilo teško.",
      bullet1: `Prvo, nekada je u mene pucao loš čovek iz vazdušnog pištolja. Pored kičme mi je zaglavljen metak. On mi ne šteti zdravlju i ne treba ga vaditi, osim ako ne počne da boli.`,
      bullet2: `Drugo, jako davno sam slomila zadnju šapicu. Niko me nije lečio, pa je srasla krivo, i ponekad posle sat vremena hodanja počnem da hramljem. Doktor kaže da nije strašno, to mi daje šarm!`,
      bullet3: `Treće, u srcu mi živi srčani crv. Trenutno je u drugoj fazi razvoja, i Lena je već počela da ga tera napolje. Narednih pola godine idemo kod veterinara jednom u dve nedelje, dajemo mu 4000 dinara i za to dobijam injekciju i kapi. Tako će crv umreti. Zbog njega ne smem da trčim duže od 5 minuta, jer počinjem da kašljem.`,
      bullet4: `Četvrto, ne smem da se sterilišem dok ne isteramo crva. Ali iskreno, loptica mi se sviđa više nego nametljivi mužjaci.`,
    },
    conditions: {
      title: "Uslovi",
      adoption: `Lena kaže da će me dati i u stan i u kuću, ali neće dozvoliti da me iko drži na lancu.`,
      communication: `Takođe kaže da bi volela da bude u kontaktu, pa i da se druži s mojim budućim vlasnicima. I sigurno će me vratiti natrag, ako se slučajno ne budemo slagali.`,
      support: `Pomagaće oko plaćanja mog lečenja i sterilizacije. A pored toga, ona ili naša drugarica Ira uzimaće me na čuvanje kada odlučite da putujete. I još može da me vozi svojim autom kod veterinara, da ne biste plaćali taksi.`,
      perk: `Zamislite, odmah se smeštam s dve dadilje i ličnim vozačem. E ovo je nešto!`,
    },
    contact: {
      title: "Kako da me upoznate?",
      location: `Lena i ja živimo na Vukovom spomeniku, pored Super Vera Zirа. Možete doći da se prošetate s nama, popijete kafu. A ako želite, mi ćemo doći kod vas da se upoznamo!`,
    },
  },
  en: {
    nav: {
      home: "Home",
      appearance: "Appearance",
      habits: "Habits",
      skills: "Skills",
      health: "Health",
      conditions: "Conditions",
      contact: "Contact",
    },
    hero: {
      title: "Hi! I'm Bulka the dog.",
      intro: `I'm somewhere around 1–2 years old, but that's not certain. The vet is sure I won't grow anymore, so you're seeing me in my prime.`,
      story: `I was found by a girl named Lena from Russia, when I was begging at the Aleksandar Ski Staza restaurant in Banovo Brdo. I was feeling really terrible because I had more than 70 ticks on me, so Lena decided to take me in and help me.`,
      current: `Now Lena has patched me up, taught me all sorts of wisdom, and is ready to give me to good owners for adoption. Lena cried while making this website, because she wants to keep me, but she has to leave Belgrade every year for the entire winter due to air quality problems. And she wants loving people to always be by my side.`,
      question: "Read about me — maybe you'll fall in love with me and want to take me in?",
    },
    appearance: {
      title: "Appearance",
      description: `I weigh 22 kilograms, and I'm 50 cm tall at the withers. I have magnificent soft ears like a corgi, and a curly tail like a husky. And my little face looks like an Akita Inu. All in all, my grandmother was clearly hanging out with some noble dogs.`,
    },
    habits: {
      title: "Household habits",
      bathroom: `I figured out that you're supposed to go to the bathroom outside on my second day living at home, and since then I've never peed indoors.`,
      walks: `I get walked twice a day: at 10 in the morning and 10 at night. I prefer being at home, so I'm happy to do my business and head back, but I can also keep you company for the whole day and go with you to the bank, to the beauty salon, to a restaurant, or to visit friends. I'll quietly lie down next to you and sprawl out.`,
      behavior: `I won't jump on other dogs or fight with them — I didn't find myself in a dumpster, after all. I can walk calmly both on a leash and off: I'll walk around you and sniff the flowers.`,
      car: `I can jump into the car on my own and ride calmly in the back seat. I have a superpower — I never get carsick!`,
      home: `At home I mostly sleep. Lena doesn't let me climb on the couch, which I of course consider discrimination. If I happen to be left alone all day, I'll just keep sleeping. I don't understand dogs who are afraid to be home alone — quite the opposite, it's great, you can enjoy the silence.`,
      food: `I eat dry food twice a day. And treats. I love dog pâté and cheese.`,
      cats: `Right now I live with two cats. Honestly, I don't even notice them: they just walk around, what do I care.`,
    },
    skills: {
      title: "Skills",
      intro: `They say I'm a smart dog, because in one week I learned a whole five commands: "Sit", "Lie down", "Place", "Come", "Give paw", "Ball".`,
      explanation: `I don't get what's so hard about it: you just do what you're asked, and then you get a treat.`,
    },
    health: {
      title: "Health",
      intro: "Life on the streets was hard.",
      bullet1: `First, a bad person once shot me with an air pistol. There's a bullet lodged near my spine. It doesn't affect my health and doesn't need to be removed unless it starts to hurt.`,
      bullet2: `Second, a long time ago I broke my back leg. Nobody treated me, so it healed crookedly, and sometimes after an hour of walking I start to limp. The doctor says it's no big deal, it adds to my charm!`,
      bullet3: `Third, I have a heartworm living in my heart. It's currently at stage two, and Lena has already started driving it out. For the next six months we'll visit the vet once every two weeks, pay him 4000 dinars, and in exchange I'll get an injection and drops. That's how the worm will die. Because of it, I'm not allowed to run for more than 5 minutes, because I start coughing.`,
      bullet4: `Fourth, I can't be spayed until we get rid of the worm. But honestly, I like the ball more than pushy male dogs anyway.`,
    },
    conditions: {
      title: "Conditions",
      adoption: `Lena says she'll give me to both an apartment and a house, but she won't allow anyone to keep me on a chain.`,
      communication: `She also says she'd like to stay in touch, or even be friends, with my future owners. And she will definitely take me back if we don't end up getting along.`,
      support: `She'll help pay for my treatment and spaying. And on top of that, either she or our friend Ira will take me for boarding whenever you decide to travel. And she can also drive me to the vet in her car, so you don't have to pay for a taxi.`,
      perk: `Imagine that, I'm coming as a package deal with two nannies and a personal driver. Now that's something!`,
    },
    contact: {
      title: "How to meet me?",
      location: `Lena and I live at Vukov Spomenik, near Super Vero Zira. You can come walk with us, have some tea. Or if you prefer, we'll come to you to meet!`,
    },
  },
};

export function getTranslation(language: Language, key: string): string {
  const keys = key.split(".");
  let value: any = translations[language];

  for (const k of keys) {
    value = value[k];
    if (value === undefined) {
      console.warn(`Translation missing for ${language}.${key}`);
      return key;
    }
  }

  return value;
}
