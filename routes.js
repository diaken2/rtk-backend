import express from "express";
import TariffModel from "./models/Tariff.js";
import fs from "fs/promises";
import path from "path";
import isEqual from 'lodash.isequal';
const router = express.Router();
const JSON_FOLDER = path.resolve("../rtk-telecom-main/data/cities");
const ADMIN_CREDENTIALS = {
  login: "admin",
  password: "rtk123" // Замените на свой пароль
};

function initializeDefaultServices() {
  return {
    "internet": {
      "id": "internet",
      "title": "Интернет",
      "description": "Тарифы на интернет",
      "meta": {
        "description": "Тарифы на интернет",
        "keywords": [
          "Интернет"
        ],
        "ogImage": "/og/default.jpg"
      }},
   "internet-tv": {
      "id": "internet-tv",
      "title": "Интернет + ТВ",
      "description": "Тарифы на интернет + тв",
      "meta": {
        "description": "Тарифы на интернет + тв",
        "keywords": [
          "Интернет + ТВ"
        ],
        "ogImage": "/og/default.jpg"
      }},
     "internet-tv-mobile": {
      "id": "internet-tv-mobile",
      "title": "Интернет + ТВ + Моб. связь",
      "description": "Тарифы на интернет + тв + моб. связь",
      "meta": {
        "description": "Тарифы на интернет + тв + моб. связь",
        "keywords": [
          "Интернет + ТВ + Моб. связь"
        ],
        "ogImage": "/og/default.jpg"
      }},
    "internet-mobile": {
      "id": "internet-mobile",
      "title": "Интернет + Моб. связь",
      "description": "Тарифы на интернет + моб. связь",
      "meta": {
        "description": "Тарифы на интернет + моб. связь",
        "keywords": [
          "Интернет + Моб. связь"
        ],
        "ogImage": "/og/default.jpg"
      }
    }
  }
}
const toStr = v => (v === undefined || v === null) ? '' : String(v).trim();
const lc = v => toStr(v).toLowerCase();
const num = v => {
  if (v === undefined || v === null) return NaN;
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v).replace(/\u00A0/g,'').replace(/\s+/g,' ').trim();
  if (s === '' || s === '-' || /^ложь$/i.test(s)) return NaN;
  s = s.replace(/,/g, '.').replace(/[^\d.\-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const isTruthy = v => {
  const s = lc(v);
  return ['1','true','да','y','yes','истина'].includes(s);
};

// Роут для входа
router.post('/login', (req, res) => {
  const { login, password } = req.body;
  
  if (login === ADMIN_CREDENTIALS.login && password === ADMIN_CREDENTIALS.password) {
    return res.json({ success: true, token: "simple-auth-token" });
  } else {
    return res.status(401).json({ success: false, error: "Неверные данные" });
  }
});
// Функция для slug'а: удаляет приставки и транслитерирует
function slugifyCityName(city) {
  if (!city || typeof city !== 'string') return '';

  const map = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
  };

  // список приставок — расширяемый
  const prefixes = [
    // общие
    'г', 'г\\.', 'город',
    'пгт', 'пгт\\.',
    'рп', 'рп\\.',
    'пос', 'пос\\.', 'поселок', 'посёлок',
    'п\\.', // п. (посёлок)
    'с\\.', 'село',
    'аул', 'деревня',
    'д', 'д\\.', // д. или д
    'тер', 'тер\\.',
    'ст-ца', 'станица',
    'хутор', 'хут\\.'
  ];

  // соберём регулярку: в начале строки, возможно ведущие пробелы,
  // затем одна из приставок и затем любые разделители (точки, пробелы, дефисы)
  const prefPattern = new RegExp(
    '^\\s*(?:' + prefixes.join('|') + ')(?:[\\s.\\-–—]+)',
    'i'
  );

  // 1) привести к нижнему регистру и заменить NBSP
  let s = city.toLowerCase().replace(/\u00A0/g, ' ').trim();

  // 2) удалить приставку (если есть)
  s = s.replace(prefPattern, '');

  // 3) убрать кавычки и лишние символы, оставить буквы/цифры/пробел/дефис/точки
  //    (точки/запятые/скобки удалим — они превратятся в дефисы позже)
  s = s.replace(/[«»"(),:;\/\\]/g, ' ').trim();

  // 4) транслитерация кириллицы -> латиница
  s = s.replace(/[а-яё]/g, c => map[c] || '');

  // 5) заменить любые «пробельные» последовательности и неподходящие символы на дефис
  s = s
    .replace(/\s+/g, '-')            // пробелы -> дефис
    .replace(/[^a-z0-9-]/g, '-')     // все не a-z0-9- -> дефис
    .replace(/-+/g, '-')             // сжать множественные дефисы
    .replace(/^-+|-+$/g, '');        // убрать дефисы в начале и конце

  return s;
}

function normalizeRegionName(regionName) {
  if (!regionName || typeof regionName !== 'string') return '';

  return regionName
    .trim()
    .replace(/\s+/g, ' ') // Убираем двойные пробелы
    // Универсальная замена: ищем отдельно стоящие сокращения с точкой или без
    .replace(/(^|\s)(обл)(\.|\s|$)/gi, '$1область$3')
    .replace(/(^|\s)(респ)(\.|\s|$)/gi, '$1Республика$3')
    .replace(/(^|\s)(край)(\.|\s|$)/gi, '$1край$3')
    .replace(/(^|\s)(авт)(\.?\s?окр)(\.|\s|$)/gi, '$1автономный$3$4')
    .replace(/(^|\s)(АО)(\s|$)/gi, '$1автономный округ$3')
    .replace(/(^|\s)(г)(\.|\s|$)/gi, '$1город$3')
    .replace(/(^|\s)(р-н)(\s|$)/gi, '$1район$3')
    // Убираем возможные двойные пробелы после замен
    .replace(/\s+/g, ' ')
    .trim()
    // Стандартизируем регистр
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}



router.get("/regions", async (req, res) => {
  try {
    // 1. Достаем ВСЕ города из базы
    const allCities = await TariffModel.find(
      { 
        "meta.region": { $exists: true, $ne: "" },
        "meta.name": { $exists: true, $ne: "" }
      },
      { "meta.name": 1, "meta.region": 1, _id: 0 }
    ).lean();

    // 2. Вручную группируем с нормализацией
    const regionMap = new Map(); // Map для группировки

    for (const city of allCities) {
      const originalRegion = city.meta.region;
      const cityName = city.meta.name;
      
      // Пропускаем пустые значения
      if (!originalRegion || !cityName) continue;

      // НОРМАЛИЗУЕМ название региона
      const normalizedRegion = normalizeRegionName(originalRegion);
      
      // Добавляем в группу
      if (!regionMap.has(normalizedRegion)) {
        regionMap.set(normalizedRegion, new Set()); // Используем Set для уникальности городов
      }
      regionMap.get(normalizedRegion).add(cityName);
    }

    // 3. Преобразуем Map в нужную структуру
    const regionsArray = Array.from(regionMap.entries()).map(([regionName, citiesSet]) => ({
      region: regionName,
      cities: Array.from(citiesSet).sort() // Сортируем города по алфавиту
    }));

    // 4. Группируем по буквам (как в твоём формате)
    const formattedRegions = [];

    for (const regionData of regionsArray) {
      const firstLetter = regionData.region.charAt(0).toUpperCase();
      
      let letterGroup = formattedRegions.find(g => g.letter === firstLetter);
      if (!letterGroup) {
        letterGroup = { letter: firstLetter, areas: [] };
        formattedRegions.push(letterGroup);
      }

      letterGroup.areas.push({
        id: slugifyCityName(regionData.region),
        name: regionData.region,
        cities: regionData.cities
      });
    }

    // Сортируем всё по алфавиту
    formattedRegions.sort((a, b) => a.letter.localeCompare(b.letter));
    formattedRegions.forEach(letterGroup => {
      letterGroup.areas.sort((a, b) => a.name.localeCompare(b.name));
    });

    res.status(200).json(formattedRegions);

  } catch (err) {
    console.error("Ошибка при получении регионов:", err);
    res.status(500).json({ error: "Ошибка сервера при получении данных регионов" });
  }
});

// GET /api/debug/regions - для отладки: посмотреть исходные и нормализованные названия
router.get("/debug/regions", async (req, res) => {
  try {
    const allRegions = await TariffModel.distinct("meta.region");
    
    const result = allRegions.map(region => ({
      original: region,
      normalized: normalizeRegionName(region)
    }));

    res.status(200).json(result);
  } catch (err) {
    console.error("Ошибка при отладке регионов:", err);
    res.status(500).json({ error: "Ошибка отладки" });
  }
});
function formatPercent(val) {
  if (val === null || val === undefined || val === "") return "";
  const s = String(val).trim();
  // если уже содержит %, возвращаем как есть
  if (s.includes("%")) return s;
  // если пустая строка или не число — вернуть как есть
  const num = Number(s.replace(",", "."));
  if (Number.isNaN(num)) return s;
  // форматируем без лишних нулей: 10 -> 10%, 10.5 -> 10.5%
  return `${s}%`;
}

// router.get("/export-tariffs-xlsx", async (req, res) => {
//   try {
//     const docs = await TariffModel.find({});
//     if (!docs || docs.length === 0) {
//       return res.status(404).json({ error: "Тарифы не найдены" });
//     }

//     const outRows = [];

//     for (const doc of docs) {
//       if (doc.services && typeof doc.services === "object") {
//         const cityNameRaw = doc.meta?.name || doc.meta?.city || "";
//         const city = cityNameRaw
//         const region = doc.meta?.region || "";

//         for (const serviceKey of Object.keys(doc.services)) {
//           const service = doc.services[serviceKey];
//           const category = service.id || serviceKey || "";
//           const tariffs = Array.isArray(service.tariffs) ? service.tariffs : [];

//           for (const t of tariffs) {
//             const price = t.price ?? t.priсe ?? "";
//             const rawPromo = t.promo_price ?? t.discountPrice ?? t.discount_price ?? "";
//             const promoPrice = rawPromo ?? "";
//             const promoPeriod = t.promo_period ?? t.discountPeriod ?? t.discount_period ?? "";
//             const rawPromoPercent = t.promo_percent ?? t.discountPercentage ?? t.discount_percentage ?? "";
//             const promoPercent = formatPercent(rawPromoPercent);

//             const tvChannels = t.tvChannels ?? t.tv_channels ?? t.tv_total ?? "";
//             const mobileData = t.mobileData ?? t.mobile_data ?? t.sim_traffic ?? "";
//             const mobileMinutes = t.mobileMinutes ?? t.mobile_minutes ?? t.sim_minutes ?? "";

//             const connectPrice = t.connect_price ?? t.connectPrice ?? "";
//             const isHit = (t.isHit ?? t.is_hit) ? "да" : "";

//             const features = Array.isArray(t.features) ? t.features.join("; ") : (t.features || "");

//             let finalType = t.type || service.title || "Интернет";

//             outRows.push({
//               "Город": city,
//               "Регион": region,
//               "Категория": category,
//               "Название тарифа": t.name || "",
//               "Тип": finalType,
//               "Скорость": t.speed ?? "",
//               "Технология": t.technology ?? "",
//               "Цена": price,
//               "Цена со скидкой": promoPrice,
//               "Период скидки": promoPeriod,
//               "Процент скидки": promoPercent,
//               "Цена подключения": connectPrice,
//               "Количество ТВ каналов": tvChannels,
//               "Мобильные данные": mobileData,
//               "Мобильные минуты": mobileMinutes,
//               "Цвет кнопки": t.buttonColor ?? "",
//               "Признак хита": isHit,
//               "Особенности (через ;)": features
//             });
//           }
//         }
//       } else {
//         const tariff = doc;
//         const city = tariff.meta?.city || "";
//         const region = tariff.meta?.region || "";
//         const category = tariff.meta?.category || "internet";

//         const price = tariff.price ?? "";
//         const promoPrice = tariff.promo_price ?? tariff.discountPrice ?? "";
//         const promoPeriod = tariff.promo_period ?? tariff.discountPeriod ?? "";
//         const promoPercent = formatPercent(tariff.promo_percent ?? tariff.discountPercentage ?? "");

//         const tvChannels = tariff.tvChannels ?? tariff.tv_total ?? "";
//         const mobileData = tariff.mobileData ?? tariff.sim_traffic ?? "";
//         const mobileMinutes = tariff.mobileMinutes ?? tariff.sim_minutes ?? "";
//         const connectPrice = tariff.connect_price ?? tariff.connectPrice ?? "";
//         const isHit = (tariff.isHit ?? tariff.is_hit) ? "да" : "";
//         const features = Array.isArray(tariff.features) ? tariff.features.join("; ") : (tariff.features || "");

//         outRows.push({
//           "Город": city,
//           "Регион": region,
//           "Категория": category,
//           "Название тарифа": tariff.name || "",
//           "Тип": tariff.type || "Интернет",
//           "Скорость": tariff.speed ?? "",
//           "Технология": tariff.technology ?? "",
//           "Цена": price,
//           "Цена со скидкой": promoPrice,
//           "Период скидки": promoPeriod,
//           "Процент скидки": promoPercent,
//           "Цена подключения": connectPrice,
//           "Количество ТВ каналов": tvChannels,
//           "Мобильные данные": mobileData,
//           "Мобильные минуты": mobileMinutes,
//           "Цвет кнопки": tariff.buttonColor ?? "",
//           "Признак хита": isHit,
//           "Особенности (через ;)": features
//         });
//       }
//     }

//     const ws = XLSX.utils.json_to_sheet(outRows);
//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, "Tariffs");
//     const xlsxBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

//     res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
//     res.setHeader("Content-Disposition", "attachment; filename=\"tariffs_export.xlsx\"");
//     res.send(xlsxBuffer);
//   } catch (err) {
//     console.error("Ошибка при экспорте тарифов в XLSX:", err);
//     res.status(500).json({ error: "Не удалось экспортировать тарифы" });
//   }
// });
// GET /import-tariffs — загрузка тарифов из JSON-файлов
router.get("/import-tariffs", async (req, res) => {
try {
const files = await fs.readdir(JSON_FOLDER);
const jsonFiles = files.filter((f) => f.endsWith(".json"));

let imported = 0;

for (const file of jsonFiles) {
  const filePath = path.join(JSON_FOLDER, file);
  const content = await fs.readFile(filePath, "utf-8");
  const data = JSON.parse(content);

  const name = data.meta?.name || "";
  const slug = slugifyCityName(name);

  data.slug = slug;

  await TariffModel.findOneAndUpdate({ slug }, data, {
    upsert: true,
    new: true,
  });

  imported++;
}

res.status(200).json({ message: `Импортировано: ${imported} тарифов` });
} catch (err) {
console.error("Ошибка при импорте тарифов:", err);
res.status(500).json({ error: "Не удалось импортировать тарифы" });
}
});
router.get("/city-info/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    
    const city = await TariffModel.findOne(
      { slug }, 
      { "meta.name": 1, "meta.region": 1, _id: 0 }
    ).lean();
    
    if (!city) {
      return res.status(404).json({ error: "Город не найден" });
    }
    
    res.status(200).json({
      name: city.meta.name,
      region: city.meta.region
    });
  } catch (err) {
    console.error("Ошибка при получении информации о городе:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});
// POST /upload-tariffs — загрузка тарифов с фронта
router.post("/upload-tariffs", async (req, res) => {
  try {
    const cityMap = req.body;

    for (const key in cityMap) {
      const newCityData = cityMap[key];
      const slug = slugifyCityName(newCityData.meta?.name || key);
      newCityData.slug = slug;

      let city = await TariffModel.findOne({ slug });

      if (!city) {
        // ★ НОВЫЙ ГОРОД: Инициализируем все сервисы ★
        const defaultServices = initializeDefaultServices();
        newCityData.services = { ...defaultServices, ...newCityData.services };
        city = new TariffModel(newCityData);
      } else {
        city.meta = newCityData.meta;

        // ★ СУЩЕСТВУЮЩИЙ ГОРОД: Гарантируем наличие всех сервисов ★
        const defaultServices = initializeDefaultServices();
        city.services = { ...defaultServices, ...city.services, ...newCityData.services };
        
        for (const category in newCityData.services) {
          const newService = newCityData.services[category];

          if (!city.services[category]) {
            city.services[category] = newService;
          } else {
            const existingTariffs = city.services[category].tariffs || [];
            const uniqueTariffs = newService.tariffs.filter(newTariff => {
              return !existingTariffs.some(existingTariff => isEqual(existingTariff, newTariff));
            });
            city.services[category].tariffs = [...existingTariffs, ...uniqueTariffs];
          }
        }
      }

      city.markModified("services");
      await city.save();
    }

    res.status(200).json({ message: "Импорт завершён без дублирующих тарифов" });
  } catch (err) {
    console.error("Ошибка при загрузке тарифов:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.delete('/tariffs/mass-delete', async (req, res) => {
  try {
    const { city, service, tariffs } = req.body;

    if (!tariffs || tariffs.length === 0) {
      return res.status(400).json({ error: 'Нет тарифов для удаления' });
    }

    const tariffIds = tariffs.map(id => typeof id === 'string' ? parseInt(id) : id);

    const result = await TariffModel.updateOne(
      { slug: city },
      {
        $pull: {
          [`services.${service}.tariffs`]: { id: { $in: tariffIds } }
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Тарифы не найдены для удаления' });
    }

    res.status(200).json({ 
      message: 'Тарифы успешно удалены',
      deletedCount: result.modifiedCount
    });
  } catch (err) {
    console.error('Ошибка при массовом удалении тарифов:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


router.patch('/tariffs/mass-hide', async (req, res) => {
  try {
    const { city, service, tariffs, hidden } = req.body;

    if (!tariffs || tariffs.length === 0) {
      return res.status(400).json({ error: 'Нет тарифов для обновления' });
    }

    const tariffIds = tariffs.map(id => typeof id === 'string' ? parseInt(id) : id);

    const result = await TariffModel.updateOne(
      { slug: city },
      {
        $set: {
          [`services.${service}.tariffs.$[elem].hidden`]: hidden
        }
      },
      {
        arrayFilters: [
          { 'elem.id': { $in: tariffIds } }
        ]
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Тарифы не найдены для обновления' });
    }

    res.status(200).json({ 
      message: `Тарифы успешно ${hidden ? 'скрыты' : 'показаны'}`,
      updatedCount: result.modifiedCount
    });
  } catch (err) {
    console.error('Ошибка при массовом скрытии/отображении тарифов:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


router.patch('/tariffs/:slug/:service/:id/hide', async (req, res) => {
try {
const { slug, service, id } = req.params;
const { hidden } = req.body;

const city = await TariffModel.findOne({ slug });

if (!city) return res.status(404).json({ error: 'Город не найден' });

const serviceBlock = city.services[service];
if (!serviceBlock) return res.status(404).json({ error: 'Сервис не найден' });

const index = serviceBlock.tariffs.findIndex(t => t.id == id);
if (index === -1) return res.status(404).json({ error: 'Тариф не найден' });

serviceBlock.tariffs[index].hidden = hidden;
city.markModified('services');
await city.save();

res.status(200).json({ message: `Тариф ${hidden ? 'скрыт' : 'показан'}` });
} catch (err) {
console.error('Ошибка при скрытии/отображении тарифа:', err);
res.status(500).json({ error: 'Ошибка сервера' });
}
});





router.post('/tariffs/:slug/:service', async (req, res) => {
  try {
    const { slug, service } = req.params;
    const newTariff = req.body;

    const city = await TariffModel.findOne({ slug });
    
    if (!city) {
      return res.status(404).json({ error: 'Город не найден' });
    }

    if (!city.services[service]) {
      return res.status(404).json({ error: 'Сервис не найден' });
    }

    // Добавляем новый тариф
    city.services[service].tariffs.push(newTariff);
    city.markModified('services');
    await city.save();

    res.status(201).json({ 
      message: 'Тариф успешно добавлен',
      tariff: newTariff
    });
  } catch (err) {
    console.error('Ошибка при добавлении тарифа:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// GET /tariffs/:slug — получить данные по городу
router.get("/tariffs/:slug", async (req, res) => {
  try {
    const { fields } = req.query;
    
    const projection = {
      'meta.name': 1,
      'meta.region': 1,
      'services': 1,
      '_id': 0
    };
    
    const city = await TariffModel.findOne({ slug: req.params.slug }, projection).lean();
    
    if (!city) return res.status(404).json({ error: "Город не найден" });
    
    res.set('Cache-Control', 'public, max-age=3600');
    return res.status(200).json(city);
  } catch (err) {
    console.error("Ошибка при получении города:", err);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});


// GET /tariffs — получить список всех slug
router.get("/tariffs", async (req, res) => {
  try {
    const cities = await TariffModel.find({}, { slug: 1, "meta.name": 1 }).lean();
    return res.status(200).json(cities);
  } catch (err) {
    console.error("Ошибка при получении списка городов:", err);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});
router.get('/tariffs-full', async (req, res) => {
try {
const { city, service } = req.query;
const query = {};

if (city) query.slug = city;

const docs = await TariffModel.find(query).lean();

const result = service
  ? docs.map(doc => ({
      ...doc,
      services: {
        [service]: doc.services?.[service] || {}
      }
    }))
  : docs;

res.status(200).json(result);
} catch (err) {
console.error('Ошибка получения тарифов:', err);
res.status(500).json({ error: 'Ошибка сервера' });
}
});



router.get("/tariffs/:slug/:service", async (req, res) => {
  try {
    const { slug, service } = req.params;
    
    const projection = {
      [`services.${service}`]: 1,
      'meta.name': 1,
      '_id': 0
    };
    
    const city = await TariffModel.findOne({ slug }, projection).lean();
    
    if (!city || !city.services?.[service]) {
      return res.status(404).json({ error: "Сервис не найден" });
    }
    
    res.set('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({
      service: city.services[service],
      cityName: city.meta.name
    });
  } catch (err) {
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});



router.put('/tariffs/:slug/:service/:id', async (req, res) => {
try {
const { slug, service, id } = req.params;
const updated = req.body;


const city = await TariffModel.findOne({ slug });

if (!city) return res.status(404).json({ error: 'Город не найден' });

const serviceBlock = city.services[service];
if (!serviceBlock) return res.status(404).json({ error: 'Сервис не найден' });

const index = serviceBlock.tariffs.findIndex(t => t.id == id);
if (index === -1) return res.status(404).json({ error: 'Тариф не найден' });

serviceBlock.tariffs[index] = { ...serviceBlock.tariffs[index], ...updated };
city.markModified('services')
await city.save();
res.status(200).json({ message: 'Тариф обновлён' });
} catch (err) {
console.error('Ошибка при обновлении тарифа:', err);
res.status(500).json({ error: 'Ошибка сервера' });
}
});


router.delete('/tariffs/:slug/:service/:id', async (req, res) => {
try {
const { slug, service, id } = req.params;


const city = await TariffModel.findOne({ slug });

if (!city) return res.status(404).json({ error: 'Город не найден' });

const serviceBlock = city.services[service];
if (!serviceBlock) return res.status(404).json({ error: 'Сервис не найден' });

serviceBlock.tariffs = serviceBlock.tariffs.filter(t => t.id != id);
city.markModified('services')
await city.save();
res.status(200).json({ message: 'Тариф удалён' });
} catch (err) {
console.error('Ошибка при удалении тарифа:', err);
res.status(500).json({ error: 'Ошибка сервера' });
}
});
export default router;