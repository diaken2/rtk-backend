import mongoose from 'mongoose'

const tariffSchema = new mongoose.Schema({
slug: { type: String, required: true, unique: true },
meta: {
name: String,
region: String,
timezone: String
},
services: Object
}, { timestamps: true })

export default mongoose.model('Tariff', tariffSchema)
