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
if (!city) return "";

const raw = city
.replace(/^((г|пгт|п|с|д|ст|аул).?[\s-]*)+/i, "") // убираем префиксы
.trim()
.toLowerCase();

return raw
.replace(/ /g, "-")
.replace(/[а-яё]/gi, (c) =>
({
а: "a",
б: "b",
в: "v",
г: "g",
д: "d",
е: "e",
ё: "e",
ж: "zh",
з: "z",
и: "i",
й: "i",
к: "k",
л: "l",
м: "m",
н: "n",
о: "o",
п: "p",
р: "r",
с: "s",
т: "t",
у: "u",
ф: "f",
х: "h",
ц: "c",
ч: "ch",
ш: "sh",
щ: "sch",
ъ: "",
ы: "y",
ь: "",
э: "e",
ю: "yu",
я: "ya",
}[c.toLowerCase()] || "")
);
}

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
        city = new TariffModel(newCityData);
      } else {
        city.meta = newCityData.meta;

        for (const category in newCityData.services) {
          const newService = newCityData.services[category];

          if (!city.services[category]) {
            city.services[category] = newService;
          } else {
            const existingTariffs = city.services[category].tariffs || [];

            // 🔍 фильтрация на основе полной идентичности
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