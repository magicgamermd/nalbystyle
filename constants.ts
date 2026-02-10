import { Service, Barber } from './types';

export const INITIAL_SERVICES: Service[] = [
  {
    id: 's1',
    name: "Haircut",
    nameBg: "Подстригване",
    price: 25,
    duration: 45,
    description: "Precision haircut tailored to your style.",
    descriptionBg: "Прецизно подстригване, съобразено с вашия стил.",
    icon: "fa-solid fa-scissors"
  },
  {
    id: 's2',
    name: "Beard Trim",
    nameBg: "Брада",
    price: 15,
    duration: 20,
    description: "Shaping and conditioning specifically for your beard.",
    descriptionBg: "Оформяне и подхранване специално за вашата брада.",
    icon: "fa-solid fa-feather-pointed" // Used as a stylised razor/blade
  },
  {
    id: 's3',
    name: "Haircut & Beard",
    nameBg: "Подстригване и Брада",
    price: 35,
    duration: 60,
    description: "Complete grooming for hair and beard.",
    descriptionBg: "Пълна грижа за косата и брадата.",
    icon: "fa-solid fa-user-tie"
  },
  {
    id: 's4',
    name: "Combo (Cut, Dye, Beard)",
    nameBg: "Комбо (Подстригване, Боя, Брада)",
    price: 45,
    duration: 90,
    description: "The full transformation package including color.",
    descriptionBg: "Пълният пакет за трансформация, включително боядисване.",
    icon: "fa-solid fa-wand-magic-sparkles"
  },
  {
    id: 's5',
    name: "Face Cleaning",
    nameBg: "Почистване Лице",
    price: 20,
    duration: 30,
    description: "Deep cleansing and exfoliation treatment.",
    descriptionBg: "Дълбоко почистваща и ексфолираща терапия.",
    icon: "fa-solid fa-spa"
  },
  {
    id: 's6',
    name: "Friction (Head Massage)",
    nameBg: "Фрикция (Масаж на глава)",
    price: "Specialist", // Indicating custom pricing or specialized service
    duration: 15,
    description: "Invigorating scalp massage performed by a specialist.",
    descriptionBg: "Освежаващ масаж на скалпа, извършван от специалист.",
    icon: "fa-solid fa-chair"
  }
];

export const INITIAL_BARBERS: Barber[] = [
  {
    id: 'b1',
    name: 'Asen Nalbantov "Nalby"',
    nameBg: 'Асен Налбантов "Nalby"',
    specialty: 'Head Barber & Stylist',
    specialtyBg: 'Главен Бръснар & Стилист',
    bio: "The visionary behind the chair. Nalby combines years of international experience with a passion for perfection. If you want the best, you come to him.",
    bioBg: "Визионерът зад стола. Nalby съчетава години международен опит със страст към съвършенството. Ако искате най-доброто, идвате при него.",
    avatar: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    rating: 5.0
  },
  {
    id: 'b2',
    name: 'Aleksandar',
    nameBg: 'Александър',
    specialty: 'Fades & Trends',
    specialtyBg: 'Фейд & Модерни визии',
    bio: "Aleksandar has a sharp eye for detail and keeps up with the latest urban trends. His fades are seamless and his lines are crisp.",
    bioBg: "Александър има набито око за детайла и следи последните градски тенденции. Неговите фейдове са безшевни, а линиите - остри.",
    avatar: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    rating: 4.9
  },
  {
    id: 'b3',
    name: 'Denis',
    nameBg: 'Денис',
    specialty: 'Classic Cuts',
    specialtyBg: 'Класическо подстригване',
    bio: "Denis brings the old-school vibe with modern techniques. He specializes in classic gentleman cuts that never go out of style.",
    bioBg: "Денис носи олд-скул атмосферата с модерни техники. Той специализира в класически джентълменски подстригвания, които никога не излизат от мода.",
    avatar: 'https://images.unsplash.com/photo-1605497788044-5a90406410d5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    rating: 4.8
  },
  {
    id: 'b4',
    name: 'Simeon',
    nameBg: 'Симеон',
    specialty: 'Beard Specialist',
    specialtyBg: 'Специалист Бради',
    bio: "The master of the blade. Simeon knows exactly how to sculpt a beard to compliment your face shape perfectly.",
    bioBg: "Майсторът на бръснача. Симеон знае точно как да оформи брадата, за да допълни перфектно формата на лицето ви.",
    avatar: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    rating: 4.9
  }
];

export const TIME_SLOTS = [
  "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"
];

// Native audio model from official Google example
export const VOICE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

export const VOICE_CONFIG = {
  inputSampleRate: 16000,
  outputSampleRate: 24000,
  bufferSize: 2048,
  greetingMessage: "Здравейте! Аз съм Блейд от Blade & Bourbon. С какво мога да ви помогна?"
};