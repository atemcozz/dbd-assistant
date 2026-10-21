import { Controller, Get } from '@nestjs/common'
import { WikiService } from './wiki.service'

@Controller()
export class WikiController {
  constructor(private readonly wikiService: WikiService) {}

  // Public reference content — no session or game code required.
  @Get('wiki')
  getWiki() {
    return this.wikiService.getWiki()
  }
}
