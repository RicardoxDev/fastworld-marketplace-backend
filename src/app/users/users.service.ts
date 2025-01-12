import { ROLE_ENUM } from './../../const/role.const';
import {
  Injectable,
  NotAcceptableException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import User from './entitys/user.entity';
import { Repository } from 'typeorm';
import CreateUserDto from './DTOs/create-user.dto';
import { ProfilesService } from '../profiles/profiles.service';
import { JwtService } from '@nestjs/jwt';
import RoleService from '../role/roles.service';
// import UserDto from './DTOs/user.dto';
import * as bcrypt from 'bcrypt';
// import * as qs from 'qs';
import QueryParamsDto from 'src/common/dtos/query-params.dto';
import { PageMetaDto } from 'src/common/dtos/page-meta.dto';
import { PageDto } from 'src/common/dtos/page.dto';
import UserDto from './DTOs/user.dto';
// import UserDto from './DTOs/user.dto';

@Injectable()
export default class UserService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private profileService: ProfilesService,
    private jwtService: JwtService,
    private roleService: RoleService,
  ) {}

  public async findMe(token: string) {
    const cleanedToken = token.split(' ')[1];
    const {
      payload: { id },
    } = this.jwtService.verify<any>(cleanedToken, {
      complete: true,
    });
    const findUser = await this.userRepo.findOne({
      where: { id },
      relations: ['role'],
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = findUser;
    return result;
  }

  public async findAllUser(queryParams: QueryParamsDto) {
    const [entities, count] = await Promise.all([
      this.userRepo.find({
        order: queryParams.order,
        relations: queryParams.relations,
        take: queryParams.take,
        skip: queryParams.skip,
        where: queryParams.where,
      }),
      this.userRepo.count(),
    ]);
    const pageMetaDto = new PageMetaDto({
      itemCount: count,
      pageOptionsDto: queryParams,
    });
    return new PageDto(entities, pageMetaDto);
  }

  public async findOneUser(id: number, queryParams: QueryParamsDto) {
    const findUser = await this.userRepo.findOne({
      where: { id },
      relations: queryParams.relations,
    });
    if (!findUser) {
      throw new NotFoundException();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = findUser;
    return result;
  }

  public async createUserAdmin(createUserDto: CreateUserDto) {
    return await this.createUser(createUserDto, ROLE_ENUM.Admin);
  }

  public async createUserManager(createUserDto: CreateUserDto) {
    return await this.createUser(createUserDto, ROLE_ENUM.Manager);
  }

  public async createUserClient(createUserDto: CreateUserDto) {
    return await this.createUser(createUserDto, ROLE_ENUM.Client);
  }

  private async createUser(createUserDto: CreateUserDto, role: string) {
    const saltOrRounds = 10;
    const findUser = await this.userRepo.findOneBy({
      username: createUserDto.username,
    });
    if (findUser) {
      throw new NotAcceptableException('this username already use');
    }
    const findRole = await this.roleService.findOneRole(role);
    const newProfile = await this.profileService.createProfile(
      createUserDto.profile,
    );
    const hashPass = await bcrypt.hash(createUserDto.password, saltOrRounds);
    const newUser = this.userRepo.create({
      ...createUserDto,
      password: hashPass,
      profile: newProfile,
      role: findRole,
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...user } = await this.userRepo.save(newUser);
    return user;
  }

  public async updateOneUser(id: number, body: User) {
    const findUser = await this.userRepo.findOne({
      where: { id },
      relations: ['role', 'profile'],
    });
    // check pass empty
    if (!findUser) throw new NotFoundException();
    if (!body.password) delete body.password;
    const mergeUser = this.userRepo.merge(findUser, body);
    const updateUser = await this.userRepo.save(mergeUser);
    return new UserDto(updateUser);
  }

  public async updateStatusUser(role: string, id: number) {
    if (ROLE_ENUM[role]) {
      throw new NotAcceptableException('Role not acceptable');
    }
    const findUser = await this.userRepo.findOneBy({ id });
    const createUser = this.userRepo.create({
      ...findUser,
      isActive: !findUser.isActive,
    });
    return await this.userRepo.save(createUser);
  }

  public async validateUser(username: string, pass: string) {
    const findUser = await this.userRepo.findOne({
      where: { username },
      relations: ['role'],
    });
    const isMatch = await bcrypt.compare(pass, findUser.password);
    if (!isMatch) {
      throw new UnauthorizedException();
    }
    console.log(new UserDto(findUser));
    return new UserDto(findUser);
  }

  async login(user: User) {
    const payload = { ...user, username: user.username, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
