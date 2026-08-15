/**
 * Página Skills: lista e edita as skills do Vekta Ai (.claude/skills/).
 */
const skillsService = require('../services/skills.service');
const { RAIZ } = require('../config');

function skills(_req, res) {
  res.json({ itens: skillsService.listarSkills(RAIZ) });
}

function obterSkill(req, res) {
  try {
    res.json(skillsService.obterSkill(RAIZ, req.params.nome));
  } catch (erro) {
    const status = /não encontrada/i.test(erro.message || '') ? 404 : 400;
    res.status(status).json({ erro: erro.message });
  }
}

function salvarSkill(req, res) {
  try {
    const atualizada = skillsService.salvarSkill(
      RAIZ,
      req.params.nome,
      String(req.body.conteudo ?? ''),
    );
    res.json({ ok: true, skill: atualizada });
  } catch (erro) {
    const status = /não encontrada/i.test(erro.message || '') ? 404 : 400;
    res.status(status).json({ erro: erro.message });
  }
}

module.exports = { skills, obterSkill, salvarSkill };
